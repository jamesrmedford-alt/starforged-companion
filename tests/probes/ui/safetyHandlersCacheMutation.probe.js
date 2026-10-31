/**
 * PROBE (ui audit) — SAFETY-HANDLERS-MUTATE-CACHE
 *
 * applyTakeBreak / applySafetyFlag (src/safety/sessionDialogs.js) — and
 * applyPrivateLinesSync / syncSafetyToCampaignState (src/ui/settingsPanel.js)
 * — set their field on the value `game.settings.get` returned (this client's
 * cached campaignState, by reference) and then write it. rules/foundry-api.md:
 * "set nothing on it before a write that can fail". When the GM's write is
 * refused, the card says "The +1 was not recorded", but the GM's cache keeps
 * `nextMoveAdd`: the next whole-object write from that client — here an
 * unrelated Set a Flag — persists the "unrecorded" +1 into the world, and the
 * pipeline (which reads the same cache) applies it to the next roll.
 *
 * Asserts the CORRECT behaviour (a refused write leaves the GM's cache and
 * the world as they were), so it FAILS today.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { failWrites, campaignStateWrite } from "../../helpers/faults.js";

describe("Take a Break on the canonical GM, write refused (SAFETY-HANDLERS-MUTATE-CACHE)", () => {
  let table;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: { sessionActive: true } } } });
  });

  it("a refused Take a Break write leaves no +1 behind on the GM's client", async () => {
    silenceConsoleErrors();
    const gm = table.client("gm-1");
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    gm.answerDialogs(d => d.choose("move_on"));
    await gm.chat("!break");
    await table.settle();

    // The card is honest about the failure …
    const card = table.cards(f => f.takeBreakCard)[0];
    expect(card?.content).toContain("sf-not-recorded");
    expect(table.world.campaignState().nextMoveAdd).toBeUndefined();

    // … but the GM's cached campaignState still carries the grant the pipeline reads.
    expect(gm.getSetting("campaignState").nextMoveAdd).toBeUndefined();
  });

  it("an unrelated later write from the GM does not resurrect the refused +1 into the world", async () => {
    silenceConsoleErrors();
    const gm = table.client("gm-1");
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    gm.answerDialogs(d => d.choose("move_on"));
    await gm.chat("!break");
    await table.settle();
    expect(table.world.campaignState().nextMoveAdd).toBeUndefined();   // refused, card says so

    // Later the GM sets a flag — applySafetyFlag writes the whole cached object.
    gm.answerDialogs(d => d.submit({ 'textarea[name="text"]': "spiders", 'select[name="visibility"]': "public" }));
    await gm.chat("!flag");
    await table.settle();

    expect(table.world.campaignState().safetyFlags?.map(f => f.text)).toEqual(["spiders"]);
    // Today: the "+1 was not recorded" grant lands in the world with the flag.
    expect(table.world.campaignState().nextMoveAdd).toBeUndefined();
  });
});
