/**
 * PROBE — SWEEP-02 SETUP-CARD-CANONICAL-ONLY (sweep auditor, family 3: the
 * inverse of the isGM / isCanonicalGM rule — a per-GM notice gated to the
 * canonical GM alone)
 *
 * What the user does: two GMs open a world whose World Truths are not set yet.
 *
 * What happens: the ready hook (src/index.js:6946-7000) runs its session mint
 * on the canonical GM only (issue #326 W54 — one emitter for world-creating
 * work) and, inside that gate, posts the "◈ Campaign Setup — No World Truths
 * have been established" card whispered to `[game.user.id]` (src/index.js:6986-6998)
 * — the canonical GM's own id. The second GM never sees the setup prompt: it
 * is not world-creating work but a notice to the GMs, and `gmUserIds()`
 * (src/index.js:5155) exists for exactly this.
 *
 * What should happen: the card is posted once (single emitter) and whispered
 * to every GM (`gmUserIds()`), as the GMs' payoff-failure and lock-released
 * cards are.
 *
 * Controls: the card is posted exactly once at a two-GM table.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/setupCardWhisperAllGms.probe.js
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

let table;

beforeAll(async () => {
  table = await simulateTable({
    users: [USERS.GM, USERS.GM2, USERS.P1],
    world: { settings: { campaignState: { ...CampaignStateSchema, worldTruthsSet: false } } },
  });
  await table.settle();
}, 30_000);
afterAll(() => table?.teardown());

describe("PROBE SWEEP-02 SETUP-CARD-CANONICAL-ONLY", () => {
  it("control: the Campaign Setup card is posted once (single emitter — the canonical GM)", () => {
    expect(table.cards(f => f.setupCard)).toHaveLength(1);
  }, 30_000);

  it("the Campaign Setup card is whispered to every GM, not only the canonical one", () => {
    const card = table.cards(f => f.setupCard)[0];
    // Expected: both GMs. Today: ["gm-1"] — the second GM never sees the prompt.
    expect([...(card?.whisper ?? [])].sort()).toEqual(["gm-1", "gm-2"]);
  }, 30_000);
});
