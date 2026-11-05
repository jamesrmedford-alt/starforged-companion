/**
 * STARFORGED COMPANION
 * tests/unit/oracleFollowupLength.test.js
 *
 * Issue #331 X28 (ORACLE-FOLLOWUP-LENGTH-CONFLICT). With Length (sentences)
 * set to anything but 3, the oracle follow-up's request carried two counts:
 * its role says "Render it as 2-3 sentences" (issue #326 W40 removed the
 * Length line from this mode's STYLE block for that reason) while its user
 * message asked for the setting's, "Render this result as 7 sentence(s)" —
 * the W40 conflict, moved from the STYLE block to the user message. The
 * Length setting governs move and paced narration only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narrateOracleFollowup } from '../../src/narration/narrator.js';
import { buildPacedNarrativeUserMessage } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.narrationLength`, 7);
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
  });
  apiPost.mockResolvedValue(reply('Yes — the hatch is sealed.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'));
});

describe('X28 — the oracle follow-up states one sentence count', () => {
  it('the oracle follow-up request states one sentence count', async () => {
    await narrateOracleFollowup({
      kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (50/50)', question: 'Is the hatch sealed?',
      rolledLine: 'd100 = 47 → Yes', campaignState: game.settings.get(MODULE_ID, 'campaignState'), speakerActorId: null,
    });
    expect(apiPost).toHaveBeenCalledTimes(1);
    const body = apiPost.mock.calls[0][2];
    const system = body.system.map(b => b.text).join('\n');
    const user   = String(body.messages[0].content);

    expect(system).toMatch(/Render it as 2-3 sentences/);          // the mode's own count (control)
    expect(system).not.toMatch(/Length: 7 sentences/);              // W40: no Length line for this mode (control)
    // The user message asked for the Length setting's count beside it
    // ("Render this result as 7 sentence(s) of in-fiction prose").
    expect(user).not.toMatch(/7 sentence/);
    expect(user).toMatch(/Render this result as 2-3 sentences of in-fiction prose/);
  });

  it('control: the paced user message repeats the Length setting (its own mode)', () => {
    const user = buildPacedNarrativeUserMessage('I check the hatch.', '', 7, null, 'Kira');
    expect(user).toMatch(/in 7 sentences/);
  });
});
