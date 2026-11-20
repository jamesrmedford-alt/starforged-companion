/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetrySharedRewardHolderGone.test.js
 *
 * Issue #364 PAYOFF-RETRY-SHARED-REWARD-HOLDER-GONE (decided by the
 * maintainer: wording only).
 *
 * A vow's promised reward, claimed but refused when given, is a `rewardGrant`
 * step on the GMs' payoff card, for the character who held the vow. With that
 * character's sheet deleted before the Retry the step is final: the closing
 * card says the sheet is gone, so there is no one left to receive it. For a
 * shared vow — the crew's inciting vow on every sheet, or any vow whose copies
 * are on several sheets — that is not so: the closing line now names the
 * reward and says a GM can give it by hand to another of the vow's
 * characters, naming them. A vow on one sheet alone keeps its line. Nothing
 * is given again.
 *
 * On a booted table: each card posted by the GM's own poster with the record
 * a refused grant leaves, and the GM's real press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY  = '[data-action="sf-payoff-retry"]';
const REWARD = { description: "A salvaged drive core", form: "asset" };
const TODAY  = "The promised reward “A salvaged drive core” — recorded as earned, but not given to the character: "
  + "the character's sheet is gone from the world, so there is no one left to receive it.";
const shared = (names) => "The promised reward “A salvaged drive core” — recorded as earned, but not given: the character's sheet is gone "
  + `from the world. The vow is shared, so a GM can give it by hand to another of its characters — ${names}.`;

let table, gm, postPayoffFailureCard;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);

function vowItem(vowId, { sharedVow = false } = {}) {
  const item = {
    id: `item-${vowId}-${Math.random().toString(36).slice(2, 8)}`, type: "progress", name: "Break the Siege",
    system: { subtype: "vow", rank: "formidable", current: 40, completed: true },
    flags: { [MODULE_ID]: { vowId, ...(sharedVow ? { sharedVow: true } : {}),
      reward: { status: "granted", grantedAt: "strong_hit", ...REWARD } } },
    update: async () => item,
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = structuredClone(value); },
  };
  return item;
}
const pc = (id, name, owner, items) => table.addActor({ id, name, ownership: { [owner]: 3 }, items: { contents: items } });

async function post(vowId) {
  await gm.run(() => postPayoffFailureCard({ source: "fulfil", vowName: "Break the Siege", vowId, actorId: "pc-ash", outcome: "strong_hit",
    failures: [{ step: "rewardGrant", pcId: "pc-ash", reward: REWARD, plan: { status: "granted", ...REWARD }, reason: "refused" }] }));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}
async function retryAfterAshLeaves(card) {
  table.actors.delete("pc-ash");
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
  expect(live(card).flags[MODULE_ID].resolved).toBe(true);
  expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
  expect(finalCards()).toHaveLength(1);
  return String(finalCards()[0].content);
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  gm = table.client("gm-1");
  ({ postPayoffFailureCard } = await gm.import("../../src/index.js"));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "srh-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  silenceConsoleErrors();
});

describe("issue #364 PAYOFF-RETRY-SHARED-REWARD-HOLDER-GONE — a granted reward whose holder's sheet was deleted", () => {
  it("the crew's shared vow: the closing line says a GM can give it to another of its characters, and names them", async () => {
    pc("pc-ash", "Ash", "pl-1", [vowItem("vow-crew", { sharedVow: true })]);
    pc("pc-bryn", "Bryn", "pl-2", [vowItem("vow-crew", { sharedVow: true })]);
    pc("pc-cole", "Cole", "pl-2", [vowItem("vow-crew", { sharedVow: true })]);
    const content = await retryAfterAshLeaves(await post("vow-crew"));

    expect(content).toContain(shared("Bryn or Cole"));
    expect(content).not.toContain("no one left to receive it");
  }, 30_000);

  it("a vow whose copies are on two sheets: the same, naming the one left", async () => {
    pc("pc-ash", "Ash", "pl-1", [vowItem("vow-pair")]);
    pc("pc-bryn", "Bryn", "pl-2", [vowItem("vow-pair")]);
    pc("pc-cole", "Cole", "pl-2", []);
    const content = await retryAfterAshLeaves(await post("vow-pair"));

    expect(content).toContain(shared("Bryn"));
  }, 30_000);

  it("pin: a vow on the deleted character's sheet alone keeps today's line", async () => {
    pc("pc-ash", "Ash", "pl-1", [vowItem("vow-own")]);
    pc("pc-bryn", "Bryn", "pl-2", []);
    const content = await retryAfterAshLeaves(await post("vow-own"));

    expect(content).toContain(TODAY);
    expect(content).not.toContain("The vow is shared");
  }, 30_000);
});
