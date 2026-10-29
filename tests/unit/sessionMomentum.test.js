/**
 * STARFORGED COMPANION
 * tests/unit/sessionMomentum.test.js
 *
 * A session's momentum, one award per PC, on a booted table (issue #311 P08):
 * End a Session saved the session as ended before paying anyone, and a PC's
 * refused momentum write was only logged — the session counted the bonus
 * paid, a second End paid nothing ("it was taken"), and nothing could give
 * that PC the momentum. Each award is now its own step; one that does not
 * land goes on the GMs' payoff failure card, whose Retry gives that PC alone
 * the momentum. Real actors and real writes; Claude answered at the fetch
 * boundary.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, gm, applyEndSession, applyBeginSession;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  gm = table.client("gm-1");
  ({ applyEndSession, applyBeginSession } = await gm.import("../../src/safety/sessionLifecycleDialogs.js"));
}, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, sessionLogAutoWrite: false, narratorSessionSummary: false, shipMapEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mom-s1",
      sessionNumber: 1, currentSceneId: null, sceneTruths: [] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
});

/** Refuse the first actor update that takes `actor` to momentum `to`. */
function refuseMomentum(actor, to) {
  const seen = { refused: false };
  table.interceptWrites(w => {
    if (!seen.refused && w.kind === "actor.update" && w.id === actor.id && w.changes?.["system.momentum.value"] === to) {
      seen.refused = true;
      return new Error("test: refused momentum");
    }
  });
  return seen;
}

const failureCards = () => table.cards(f => f.payoffFailureCard && f.source === "session");

describe("P08 — a session momentum award that does not land is retried for that PC", () => {
  it("End: the refused PC's +1 goes to the GMs' Retry; End again pays nothing and says so; the Retry pays it once", async () => {
    const kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
    const mara = table.addActor({ id: "pc-mara", name: "Mara", ownership: { "pl-2": 3 } });
    const refusal = refuseMomentum(kira, 3);

    await expect(gm.run(() => applyEndSession({ questFocus: "Find the beacon" }))).resolves.toEqual({ alreadyEnded: false });
    await table.settle(); await table.drain();
    expect(refusal.refused).toBe(true);
    expect([kira.system.momentum.value, mara.system.momentum.value]).toEqual([2, 3]);

    const [card] = failureCards();
    expect(card.flags[MODULE_ID].steps).toEqual([
      { step: "momentum", pcId: kira.id, amount: 1, sessionId: "mom-s1", award: "End a Session — a focus noted" },
    ]);
    expect(card.content).toMatch(/\+1 momentum for Kira \(End a Session — a focus noted\) — the world did not save it/);
    expect(card.content).toMatch(/Kira's momentum stands at 2 now/);

    // End again: the session is not closed again and pays no one — and says
    // what is still owed rather than that it was taken.
    await expect(gm.run(() => applyEndSession({ questFocus: "Find the beacon" }))).resolves.toEqual({ alreadyEnded: true });
    await table.settle(); await table.drain();
    expect([kira.system.momentum.value, mara.system.momentum.value]).toEqual([2, 3]);
    expect(table.cards(f => f.sessionLifecycleCard).at(-1).content)
      .toMatch(/Momentum that did not reach Kira waits on a GM's Retry/);

    await table.client("gm-1").click(card._id, '[data-action="sf-payoff-retry"]');
    await table.settle(); await table.drain();
    expect([kira.system.momentum.value, mara.system.momentum.value]).toEqual([3, 3]);

    // Retried: the card is spent, and the note no longer names Kira.
    table.client("gm-1").click(card._id, '[data-action="sf-payoff-retry"]');   // disabled: swallowed
    await table.settle(); await table.drain();
    expect(kira.system.momentum.value).toBe(3);
    await gm.run(() => applyEndSession({ questFocus: "Find the archive" }));
    await table.settle(); await table.drain();
    expect(table.cards(f => f.sessionLifecycleCard).at(-1).content).not.toMatch(/waits on a GM's Retry/);
    expect([kira.system.momentum.value, mara.system.momentum.value]).toEqual([3, 3]);
  });

  it("Begin's Spotlight Vignette momentum is reported the same way", async () => {
    const kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
    refuseMomentum(kira, 3);

    await gm.run(() => applyBeginSession({ vignetteRolled: true, includeGalley: false }));
    await table.settle(); await table.drain();

    expect(kira.system.momentum.value).toBe(2);
    const [card] = failureCards();
    expect(card.flags[MODULE_ID].steps[0]).toMatchObject({ step: "momentum", pcId: kira.id, award: "Begin a Session — the Spotlight Vignette" });
    await table.client("gm-1").click(card._id, '[data-action="sf-payoff-retry"]');
    await table.settle(); await table.drain();
    expect(kira.system.momentum.value).toBe(3);
  });
});
