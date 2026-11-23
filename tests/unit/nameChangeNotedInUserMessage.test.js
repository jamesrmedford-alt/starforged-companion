/**
 * STARFORGED COMPANION
 * tests/unit/nameChangeNotedInUserMessage.test.js
 *
 * Issue #377 item 1, found by the long haul's rehearsal (2026-11-23).
 *
 * NAMES THE TABLE CHANGED is rendered in the narrator's system prompt when its
 * change is this session's or the old name is in the system prompt. Every
 * narration builds its user message after its system prompt, so an old name
 * only the user message held went untold — the closing scene of the session
 * after a rename listed its EARLIER CLOSINGS, one of them "(Tamsin Vey) …",
 * and nothing said Vey was now Okoro. callNarratorAPI now adds the note at the
 * end of the user message when the user message names an old name and the
 * call carries no note yet. The cached system blocks are unchanged by it.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narratePacedInput } from '../../src/narration/narrator.js';
import { NAME_CHANGES_HEADING } from '../../src/factContinuity/nameChanges.js';

const MODULE_ID = 'starforged-companion';
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });

const RENAMED_LAST_SESSION = { from: 'Tamsin Vey', to: 'Tamsin Okoro', kind: 'renamed', about: 'a person', sessionId: 'sess-2', at: 1 };
const STATE = {
  currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-1',
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  nameChanges: [RENAMED_LAST_SESSION],
};

const narrations = () => apiPost.mock.calls.map(c => c[2]).filter(b => String(b.system?.[0]?.text ?? '').startsWith('## NARRATOR ROLE AND VOICE'));
const userOf = (body) => body.messages[0].content;
const systemOf = (body) => body.system.map(b => b.text).join('\n');

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  apiPost.mockResolvedValue(reply(`The comm hisses.${SIDECAR}`));
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...STATE });
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Mira Kestrel' }));
});

describe('an old name only the user message holds is noted there (issue #377 item 1)', () => {
  it('the player names her by the old surname, a session after the rename', async () => {
    await narratePacedInput('I raise Tamsin Vey on the comm.', JSON.parse(JSON.stringify(STATE)), { speakerActorId: 'a-actor' });
    const [body] = narrations();
    expect(systemOf(body)).not.toContain(NAME_CHANGES_HEADING);
    expect(userOf(body)).toContain('I raise Tamsin Vey on the comm.');
    expect(userOf(body).trimEnd()).toMatch(/## NAMES THE TABLE CHANGED[\s\S]*"Tamsin Vey" is now "Tamsin Okoro" \(a person\) — renamed by the table\.$/);
  });

  it('control: no old name anywhere — nothing is added', async () => {
    await narratePacedInput('I raise Tamsin on the comm.', JSON.parse(JSON.stringify(STATE)), { speakerActorId: 'a-actor' });
    const [body] = narrations();
    expect(userOf(body)).not.toContain(NAME_CHANGES_HEADING);
  });

  it('control: a call whose system prompt carries the note already gets it once', async () => {
    const thisSession = { ...STATE, nameChanges: [{ ...RENAMED_LAST_SESSION, sessionId: 'sess-3' }] };
    game.settings._store.set(`${MODULE_ID}.campaignState`, thisSession);
    await narratePacedInput('I raise Tamsin Vey on the comm.', JSON.parse(JSON.stringify(thisSession)), { speakerActorId: 'a-actor' });
    const [body] = narrations();
    expect(systemOf(body)).toContain(NAME_CHANGES_HEADING);
    expect(userOf(body)).not.toContain(NAME_CHANGES_HEADING);
  });
});
