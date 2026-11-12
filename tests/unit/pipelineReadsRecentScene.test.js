/**
 * The free-flow pipeline hands the interpreter the recent scene (alpha 23
 * playtest): a typed line after a narrator card is read with that card's
 * prose — "we're on our way" with the coordinates the NPC just sent.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({
    moveId: 'set_a_course', moveName: 'Set a Course', statUsed: 'supply', adds: 0,
    rationale: 'test', mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()), confirmInterpretation: vi.fn(async () => false),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { interpretMove } from '../../src/moves/interpreter.js';

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'a23', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-a23', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-isaac', name: 'Isaac Sutton', ownership: { 'gm-1': 3 } });
  vi.mocked(interpretMove).mockClear();
  silenceConsoleErrors();
});

describe('the pipeline reads a line against the recent scene', () => {
  it("passes the session's last narration to the interpreter", async () => {
    await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: '<div class="sf-narration-card"><div class="sf-narration-prose">A data packet chirps through.</div></div>',
      flags: { [MODULE_ID]: {
        narratorCard: true, narrationCard: true, sessionId: 'a23',
        narrationText: 'A data packet chirps through: coordinates for the gap at the edge of charted space.',
        playerText: "Tell Vuldar we're in.",
      } },
    }));
    await table.settle();

    await table.client('gm-1').chat("We're on our way.", { speaker: { actor: 'pc-isaac', alias: 'Isaac Sutton' } });
    await table.settle(); await table.drain();

    expect(vi.mocked(interpretMove)).toHaveBeenCalledTimes(1);
    const [, opts] = vi.mocked(interpretMove).mock.calls[0];
    expect(opts.recentScene).toContain('coordinates for the gap');
    expect(opts.recentScene).toContain("Tell Vuldar we're in.");
  }, 30_000);

  it('control: with no narration yet, the scene is empty', async () => {
    await table.client('gm-1').chat("We're on our way.", { speaker: { actor: 'pc-isaac', alias: 'Isaac Sutton' } });
    await table.settle(); await table.drain();
    const [, opts] = vi.mocked(interpretMove).mock.calls[0];
    expect(opts.recentScene).toBe('');
  }, 30_000);
});
