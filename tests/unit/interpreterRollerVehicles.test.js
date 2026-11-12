/**
 * STARFORGED COMPANION
 * tests/unit/interpreterRollerVehicles.test.js
 *
 * SUPPORT-VEHICLES-UNLISTED — the composition: a player's typed line reaches
 * the move interpreter with the roller's support vehicles and companions in
 * its context (movePipeline.readMove → interpretMove's `roller` →
 * buildContextSummary), so a Withstand Damage of "the hoverbike" can name it
 * as moveTarget — the support vehicle's roll rests on that target (issue #345
 * AA14). The pacing classifier is scripted to MOVE; the interpreter is real,
 * its Claude call captured.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => false),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const interpreterCalls = () => table.claude.calls.filter(c => /Player narration:/.test(c.userText ?? ''));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'irv-s1', currentSceneId: 'irv-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [
    { id: 'asset-hoverbike', name: 'Hoverbike', type: 'asset',
      system: { category: 'Support Vehicle', track: { enabled: true, name: 'Integrity', value: 3, min: 0, max: 3 }, conditions: [] } },
  ] } });
  scriptClaude(table, { fallback: () => '{"moveId":"withstand_damage","moveName":"Withstand Damage","statUsed":"integrity","moveTarget":"Hoverbike","rationale":"x"}' });
  silenceConsoleErrors();
});

describe('SUPPORT-VEHICLES-UNLISTED — the interpreter is told the roller\'s support vehicles', () => {
  it("Kira's line reaches the interpreter with her Hoverbike listed", async () => {
    await table.client('pl-1').chat('The hoverbike skids across the scree.', { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
    const call = interpreterCalls().at(-1);
    expect(call, 'the interpreter was called').toBeTruthy();
    expect(call.userText).toContain(`Kira's support vehicles: "Hoverbike"`);
  }, 30_000);
});
