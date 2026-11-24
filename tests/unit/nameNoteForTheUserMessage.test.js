/**
 * STARFORGED COMPANION
 * tests/unit/nameNoteForTheUserMessage.test.js
 *
 * Known-issues NAME-NOTE-MISSES-THE-USER-MESSAGE — found by the long haul's
 * rehearsal (2026-11-24, long-haul-rehearsal-20261124-161637 and -171307,
 * a44). Session 3's opening quotes the last session's final story cards word
 * for word (WHERE THE LAST SESSION STOPPED — ITS LAST NARRATION), and those
 * cards hold the cutter's old name, "Ashen Wake", corrected to "Cinder Wren"
 * in session 2. The prompt's NAMES THE TABLE CHANGED note listed only "Tamsin"
 * → "Tamsin Okoro": the system prompt tells a change its own texts call for,
 * and `withNameChangesNoted` (narrator.js) added the note for an old name only
 * the user message holds — but nothing once the system prompt carried a note
 * at all. Every change due for the user message's own text that the system's
 * note does not tell is added at the user message's end now: its line, or —
 * when the system's line does not name it — the short form of its old name
 * the user message uses (known-issues CORRECTED-NAME-SHORT-FORM's "not
 * covered"). It is done where every narrator call sends its user message
 * (callNarratorAPI), so the opening and a player's line are told alike.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narratePacedInput, narrateSessionVignette } from '../../src/narration/narrator.js';
import { composeOpeningScene } from '../../src/session/galleyVignette.js';
import { NAME_CHANGES_HEADING } from '../../src/factContinuity/nameChanges.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
const clone = (o) => JSON.parse(JSON.stringify(o));

const TAMSIN = { from: 'Tamsin', to: 'Tamsin Okoro', kind: 'renamed', about: 'a person', sessionId: 'sess-2', at: 1 };
const VEY    = { from: 'Tamsin Vey', to: 'Tamsin Okoro', kind: 'renamed', about: 'a person', sessionId: 'sess-2', at: 1 };
const ASHEN  = { from: 'Ashen Wake', to: 'Cinder Wren', kind: 'corrected', about: 'raider cutter', sessionId: 'sess-2', at: 2 };
const STATE = {
  currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-1',
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
};
const SHORT = 'The old name cut short is the old name too:';

const narrations = () => apiPost.mock.calls.map(c => c[2]).filter(b => String(b.system?.[0]?.text ?? '').startsWith('## NARRATOR ROLE AND VOICE'));
const userOf = (body) => body.messages[0].content;
const systemOf = (body) => body.system.map(b => b.text).join('\n');
/** What the call added after the message it was given. */
const addedTo = (body, sent) => {
  const user = userOf(body);
  expect(user.startsWith(sent)).toBe(true);
  return user.slice(sent.length);
};
/** The note at the end of a user message, after the player's line ('' with none). */
const noteAfter = (body, line) => {
  const user = userOf(body);
  const at = user.lastIndexOf(NAME_CHANGES_HEADING);
  return at > user.indexOf(line) ? user.slice(at) : '';
};

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
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Mira Kestrel' }));
});

describe('session 3\'s opening, as the rehearsal had it (a44)', () => {
  // The last session's final story card, quoted word for word to the opening.
  const LAST_CARD = { id: 'm-last', whisper: [], flags: { [MODULE_ID]: {
    narratorCard: true, sessionId: 'sess-2',
    narrationText: 'The Ashen Wake\'s boarding lock cycles shut behind you, and the corridor beyond stays dark.',
  } } };
  // The system prompt's note tells one change (this session's, so whatever
  // its texts hold); the cutter's correction is an earlier session's.
  const MINTED = { ...STATE, nameChanges: [{ ...TAMSIN, sessionId: 'sess-3' }, ASHEN] };
  const mira = { active: [{ actor: { id: 'a-actor', name: 'Mira Kestrel', type: 'character', system: { biography: '' } } }], absent: [] };

  it('the old name only its quoted narration holds is told at the end of its message, beside the system\'s note', async () => {
    game.settings._store.set(KEY, clone(MINTED));
    global.game.messages = { contents: [LAST_CARD] };
    const { userMessage } = await composeOpeningScene(mira, clone(MINTED), { draw: () => 50 });
    expect(userMessage).toContain('The Ashen Wake\'s boarding lock cycles shut behind you');

    await narrateSessionVignette({ userMessage, campaignState: clone(MINTED) });
    const [body] = narrations();
    // The system prompt's note tells the one change…
    expect(systemOf(body)).toContain('"Tamsin" is now "Tamsin Okoro" (a person) — renamed by the table.');
    expect(systemOf(body)).not.toContain('"Ashen Wake" is now');
    // …and the opening's message is told the one its quoted narration calls for — once.
    const added = addedTo(body, userMessage);
    expect(added).toContain(NAME_CHANGES_HEADING);
    expect(added).toContain('"Ashen Wake" is now "Cinder Wren" (raider cutter) — corrected by the table.');
    expect(added).not.toContain('"Tamsin" is now');
  });
});

describe('every narrator call, not only the opening (callNarratorAPI)', () => {
  it('a player\'s line names a second change\'s old name while the system prompt tells the first', async () => {
    const state = { ...STATE, nameChanges: [{ ...VEY, sessionId: 'sess-3' }, ASHEN] };
    game.settings._store.set(KEY, clone(state));
    const line = 'I hail the Ashen Wake on the open band.';
    await narratePacedInput(line, clone(state), { speakerActorId: 'a-actor' });
    const [body] = narrations();
    expect(systemOf(body)).toContain('"Tamsin Vey" is now "Tamsin Okoro" (a person) — renamed by the table.');
    const added = noteAfter(body, line);
    expect(added).toContain('"Ashen Wake" is now "Cinder Wren" (raider cutter) — corrected by the table.');
    expect(added).not.toContain('"Tamsin Vey" is now');
  });

  it('a short form only the user message uses, of a change the system prompt tells whole (CORRECTED-NAME-SHORT-FORM)', async () => {
    const state = { ...STATE, nameChanges: [{ ...ASHEN, sessionId: 'sess-3' }] };
    game.settings._store.set(KEY, clone(state));
    const line = 'I lay the manifest stamp beside the Wake\'s registry.';
    await narratePacedInput(line, clone(state), { speakerActorId: 'a-actor' });
    const [body] = narrations();
    expect(systemOf(body)).toContain('"Ashen Wake" is now "Cinder Wren" (raider cutter) — corrected by the table.');
    expect(systemOf(body)).not.toContain(SHORT);
    expect(userOf(body).trimEnd()).toMatch(new RegExp(
      `## NAMES THE TABLE CHANGED[\\s\\S]*"Ashen Wake" is now "Cinder Wren" \\(raider cutter\\) — corrected by the table\\. ${SHORT} for "the Wake" write "the Wren"\\.$`));
  });

  it('control: a change the system prompt already tells, with the short form the user message uses, is not told again', async () => {
    // The scene's truths, in the system prompt, cut the old name short too.
    const truth = {
      id: 'tr-wake', subject: { kind: 'text', text: 'the boarding party' }, fact: 'came aboard from the Wake',
      sessionId: 'sess-3', sessionNum: 3, sceneId: 'sc-1', moveId: null, source: 'narrator_sidecar', asserter: 'narrator',
      createdAt: 1, retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
    };
    const state = { ...STATE, nameChanges: [ASHEN], sceneTruths: [truth] };
    game.settings._store.set(KEY, clone(state));
    await narratePacedInput('I lay the manifest stamp beside the Wake\'s registry.', clone(state), { speakerActorId: 'a-actor' });
    const [body] = narrations();
    expect(systemOf(body)).toContain(`${SHORT} for "the Wake" write "the Wren".`);
    expect(userOf(body)).not.toContain(NAME_CHANGES_HEADING);
  });

  it('control: a change the system prompt tells, named whole in the user message, is not told again', async () => {
    const state = { ...STATE, nameChanges: [{ ...VEY, sessionId: 'sess-3' }] };
    game.settings._store.set(KEY, clone(state));
    await narratePacedInput('I raise Tamsin Vey on the comm.', clone(state), { speakerActorId: 'a-actor' });
    const [body] = narrations();
    expect(systemOf(body)).toContain(NAME_CHANGES_HEADING);
    expect(userOf(body)).not.toContain(NAME_CHANGES_HEADING);
  });
});
