/**
 * STARFORGED COMPANION
 * tests/unit/pacedNarrationPromptThrowTold.test.js
 *
 * Issue #347 residual PACED-NARRATION-THROW-BEFORE-CALL (AB21's). A typed line
 * the pacing classifier reads as NARRATIVE is narrated by narratePacedInput,
 * which builds its prompt — the scene start, the narrator's extras, the
 * system prompt, the user message — before its Claude call. AB21 made a
 * failed call post a "That line was not narrated" notice; a throw while the
 * prompt was built escaped instead to the pacing router's catch, which only
 * logged it: the line sat in chat, narrated by nothing and told to nobody.
 * It posts the same notice now, and makes no narration call.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ throwInPrompt: false }));
vi.mock('../../src/narration/narratorPrompt.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    buildPacedNarrativeUserMessage: vi.fn((...args) => {
      if (control.throwInPrompt) throw new Error('prompt build failed (test fault)');
      return original.buildPacedNarrativeUserMessage(...args);
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const LINE = 'I lean on the bar and listen to the dockhands argue.';
const NARRATIVE = JSON.stringify({ decision: 'NARRATIVE', suggestedMove: null, category: 'social', confidence: 0.9, reasoning: 'listening, no risk' });
const PROSE = 'The dockhands bicker over a crate of stolen coolant.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const isClassifier = (call) => /pacing pre-classifier/.test(call.system ?? '');
const isNarration  = (call) => call.model === NARRATION_MODEL && !isClassifier(call);

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.throwInPrompt = false;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => (isClassifier(call) ? NARRATIVE : isNarration(call) ? PROSE : '{}') });
});

/** The cards posted after the line. */
function cardsAfter(line) {
  const messages = table.world.messages();
  const at = messages.findIndex(m => m.content === line);
  return messages.slice(at + 1);
}

describe('a narrative line whose narration cannot be prepared (issue #347 residual)', () => {
  it('a throw while the prompt is built: the table is told the line was not narrated', async () => {
    silenceConsoleErrors();
    control.throwInPrompt = true;

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    expect(table.claude.calls.filter(isClassifier), 'the line was classified (setup)').toHaveLength(1);
    expect(table.claude.calls.filter(isNarration), 'no narration call was made').toHaveLength(0);
    const after = cardsAfter(LINE);
    expect(after, 'one notice after the line').toHaveLength(1);
    expect(String(after[0].content)).toMatch(/That line was not narrated/);
    expect(after[0].flags?.[MODULE_ID]?.narratorCard, 'the notice is not fiction').toBeUndefined();
  });

  it('control: the same line is narrated when the prompt builds', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
    expect(table.claude.calls.filter(isNarration)).toHaveLength(1);
    expect(table.cards(f => f.narratorCard === true && f.pacedNarrative === true)).toHaveLength(1);
    expect(cardsAfter(LINE).some(m => /That line was not narrated/.test(String(m.content)))).toBe(false);
  });
});
