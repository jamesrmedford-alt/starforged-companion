/**
 * PROBE (oracles audit) — `!oracle yes` with the rulebook's two-word odds.
 *
 * handleOracleCommand (src/index.js) splits the text on whitespace and looks
 * up ONLY parts[1] in ODDS_ALIASES. The play kit names two of the five odds
 * with two words — "Small Chance" and "Almost Certain" — so:
 *   - `!oracle yes almost certain …` → "almost" is no alias → the roll is made
 *     at 50/50 (≤ 50 instead of ≤ 90) and "almost certain" becomes part of
 *     the question;
 *   - `!oracle yes small chance …`  → odds are right but the question (card,
 *     oracle memory, narrator follow-up) starts with "chance".
 *
 * Runs on the simulated table so the real route and card are exercised.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const { GM, P1 } = USERS;
let table;

beforeAll(async () => {
  table = await simulateTable({ users: [GM, P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
});

const lastOracleMemory = () => {
  const cards = table.cards(f => f.oracleCommandCard && f.oracleMemory);
  return cards[cards.length - 1]?.flags?.[MODULE_ID]?.oracleMemory;
};

describe("PROBE: !oracle yes accepts the rulebook's odds names", () => {
  it('"almost certain" rolls at Almost Certain odds, not 50/50', async () => {
    await table.client("pl-1").chat("!oracle yes almost certain is the station still there");
    await table.settle();
    const mem = lastOracleMemory();
    expect(mem?.name).toBe("Ask the Oracle (almost certain)");   // FAILS today: "Ask the Oracle (50/50)"
    expect(mem?.question).toBe("is the station still there");
  });

  it('"small chance" keeps "chance" out of the question', async () => {
    await table.client("pl-1").chat("!oracle yes small chance will the patrol spot us");
    await table.settle();
    const mem = lastOracleMemory();
    expect(mem?.name).toBe("Ask the Oracle (small chance)");
    expect(mem?.question).toBe("will the patrol spot us");       // FAILS today: "chance will the patrol spot us"
  });
});
