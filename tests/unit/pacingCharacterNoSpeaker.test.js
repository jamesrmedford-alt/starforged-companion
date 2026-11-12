/**
 * STARFORGED COMPANION
 * tests/unit/pacingCharacterNoSpeaker.test.js
 *
 * PACING-CHARACTER-SOLO: the pacing classifier's CHARACTER line names the
 * speaker's PC. With no speaker — a player who owns no PC at a table of two
 * or more (resolveSpeakerActorId's issue #321 U23 rule) —
 * getActiveCharacterForPacing fell back on the first player-owned PC, so the
 * line was classified as another player's character. It follows the speaker
 * rule now: the one PC of a one-PC world, else none.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: false, decision: "NARRATIVE", suggestedMove: null })),
}));

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { routePacedInput } from "../../src/pacing/router.js";

let table;
const LINE = "I watch the docking clamps cycle.";

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

async function seat({ secondPc = true } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "s-1", sessionNumber: 1, currentSceneId: "sc-1" },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Kira is Pat's (pl-1); Ren belongs to a player not at the table. Quinn (pl-2) owns no PC.
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  if (secondPc) table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-absent": 3 } });
  scriptClaude(table, { fallback: () => 'The clamps hiss.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  vi.mocked(routePacedInput).mockClear();
}

async function sayAs(user) {
  await table.client(user).chat(LINE);
  await table.settle(); await table.drain();
  return vi.mocked(routePacedInput).mock.calls.at(-1)?.[0]?.character ?? null;
}

describe("the classifier's character with no speaker (PACING-CHARACTER-SOLO)", () => {
  it("a PC-less player at a table of two PCs is classified as no one's character", async () => {
    await seat();
    expect(await sayAs("pl-2")).toBeNull();
  }, 30_000);

  it("control: Kira's player is classified as Kira", async () => {
    await seat();
    expect(await sayAs("pl-1")).toEqual({ name: "Kira" });
  }, 30_000);

  it("control: in a one-PC world the one PC, as solo play rolls it", async () => {
    await seat({ secondPc: false });
    expect(await sayAs("pl-2")).toEqual({ name: "Kira" });
  }, 30_000);
});
