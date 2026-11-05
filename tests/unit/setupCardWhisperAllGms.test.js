// STARFORGED COMPANION
// tests/unit/setupCardWhisperAllGms.test.js
//
// The "◈ Campaign Setup" card reaches every GM (issue #331 X54).
//
// Two GMs open a world with no World Truths set. The ready hook posts the
// setup card inside its canonical-GM block (one emitter for the world's
// start-up work, issue #326 W54) — correct — but whispered it to
// `[game.user.id]`, the canonical GM's own id, so the second GM never saw the
// prompt. A notice to the GMs is not world-creating work: it is posted once
// and whispered to every GM (`gmUserIds()`), as the GMs' payoff-failure and
// lock-released cards are.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table;

beforeAll(async () => {
  table = await simulateTable({
    users: [USERS.GM, USERS.GM2, USERS.P1],
    world: { settings: { campaignState: { ...CampaignStateSchema, worldTruthsSet: false } } },
  });
  await table.settle();
}, 30_000);
afterAll(() => table?.teardown());

describe("the Campaign Setup card at a two-GM table (issue #331 X54)", () => {
  it("control: it is posted once (single emitter — the canonical GM)", () => {
    expect(table.cards(f => f.setupCard)).toHaveLength(1);
  }, 30_000);

  it("it is whispered to every GM, not only the canonical one — and to no player", () => {
    const card = table.cards(f => f.setupCard)[0];
    expect([...(card?.whisper ?? [])].sort()).toEqual(["gm-1", "gm-2"]);
  }, 30_000);
});
