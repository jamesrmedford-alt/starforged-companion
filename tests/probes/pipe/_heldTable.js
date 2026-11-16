/**
 * Shared table setup for the PIPE probes that run a player's line through the
 * GM's real move pipeline on a booted table (tests/helpers/multiClient.js), as
 * tests/unit/heldResultBeforePrice.test.js does. The vi.mock calls stay in each
 * probe file (they are hoisted per file); this holds what is not mocked.
 */
import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

export { MODULE_ID, USERS };

// [challenge, challenge, action] Math.random values — wits 2.
export const MISS   = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss; momentum 9 burns to a strong hit
export const WEAK   = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — a weak hit; momentum 9 burns to a strong hit
export const STRONG = [0.05, 0.15, 0.9];   // challenge 1, 2 — a strong hit: nothing to upgrade

export const BURN = '[data-action="sf-burn-momentum"]';
export const KEEP = '[data-action="sf-keep-result"]';

export async function bootTable(users = [USERS.GM, USERS.P1, USERS.P2]) {
  return simulateTable({ users });
}

/** Reset the table to a begun session with one PC (Kira, pl-1's) at `momentum`. */
export async function resetTable(table, { settings = {}, momentum = 9, sessionId = "pipe-s1" } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: sessionId, sessionNumber: 1,
      currentSceneId: "pipe-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  const pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: momentum } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  return pc;
}

/** The narrator's move-narration calls so far. */
export const narratorCalls = (table) =>
  table.claude.calls.filter(c => /MOVE OUTCOME|Narrate the consequence/.test(`${c.system}\n${c.userText}`));

/** A user clicks a button on a card, on their own client. */
export async function click(table, card, selector, user = "pl-1") {
  await table.client(user).click(card._id, selector);
  await table.settle(); await table.drain();
}
