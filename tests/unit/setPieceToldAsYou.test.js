/**
 * STARFORGED COMPANION
 * tests/unit/setPieceToldAsYou.test.js
 *
 * Issue #389 #4, OPENING-IN-THE-THIRD-PERSON. Three of the sixth live round's
 * six openings were told in the third person — "Mira is counting the water
 * ration for the third time" (a52), "Mira is holding out against a
 * loose-fitting habit of rationing" (a98), the first run's a48 — against
 * their PERSPECTIVE block's "Address the player character directly as
 * 'you'". Their MATERIAL named her: "What Mira Kestrel is doing in this lull".
 *
 * Now, in second person:
 *   - the opening's MATERIAL line is "What you (Mira Kestrel) are doing in
 *     this lull";
 *   - an opening or a spotlight that calls its character by name outside
 *     quoted speech breaks a certain obligation ([person]) and is asked
 *     again once, failing open. A closing cuts away from the character, and
 *     a third-person table names them by design: neither is checked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narrateSessionVignette } from '../../src/narration/narrator.js';
import { rollOpeningSeeds } from '../../src/session/sceneSeeds.js';
import { certainViolations, personViolations } from '../../src/moves/contracts/checks.js';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';

const MODULE_ID = 'starforged-companion';
const RUN = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../test/ci/playwright/explorations/long-haul-live-20261125-232143/replay.json'), 'utf8'));
/** The step's set-pieces, in order (a2 holds the spotlight, then the opening). */
const setPieces = (step) => RUN.recording.exchanges.filter(x => x.step === step && /narrateSessionVignette/.test(x.kind))
  .map(x => extractSidecar(x.response.content.map(c => c.text ?? '').join('')).prose);
const opening = (step) => setPieces(step).at(-1);
const MIRA = { names: ['Mira Kestrel', 'Mira'] };

describe('the opening\'s MATERIAL in second person', () => {
  const draw = () => 50;
  it('names the one character "you" in second person, and as before otherwise', () => {
    expect(rollOpeningSeeds({ present: ['Mira Kestrel'], perspective: 'second_person' }, draw)[0].label).toBe('What you (Mira Kestrel) are doing in this lull');
    expect(rollOpeningSeeds({ present: ['Mira Kestrel'], perspective: 'third_person' }, draw)[0].label).toBe('What Mira Kestrel is doing in this lull');
    expect(rollOpeningSeeds({ present: ['Mira Kestrel'] }, draw)[0].label).toBe('What Mira Kestrel is doing in this lull');
    expect(rollOpeningSeeds({ present: ['Mira Kestrel', 'Kira'], perspective: 'second_person' }, draw)[0].label).toBe('What they are doing in this lull');
  });
});

describe('[person]: a second-person set-piece never names its character outside speech', () => {
  it('the sixth live round\'s third-person openings break it; its second-person ones do not', () => {
    const person = obligationsFor({ mode: 'set-piece', person: MIRA });
    expect(person.map(o => [o.kind, o.list])).toEqual([['person', 'NOT SO']]);
    expect(person[0].text).toBe('The player\'s character is "you", for the whole narration: never "Mira Kestrel" or "Mira" outside quoted speech, and never "she" or "he" for them.');
    expect(certainViolations(opening('a52'), person)).toEqual([{ tag: 'person', quote: expect.stringContaining('Mira is counting the water ration') }]);
    expect(certainViolations(opening('a98'), person)).toEqual([{ tag: 'person', quote: expect.stringContaining('Mira is holding out') }]);
    expect(certainViolations(opening('a17'), person)).toEqual([]);
    expect(certainViolations(opening('a2'), person)).toEqual([]);
    // a2's spotlight, a flashback told the same PERSPECTIVE block, broke it too.
    const [spotlight] = setPieces('a2');
    expect(certainViolations(spotlight, person)).toEqual([{ tag: 'person', quote: expect.stringContaining('a younger Mira picks her way') }]);
  });

  it('a name in quoted speech is the speaker\'s; a possessive outside it is not', () => {
    expect(personViolations('"Mira, you came back," Tamsin says. You set the cup down.', MIRA)).toEqual([]);
    expect(personViolations('“Kestrel’s ship,” the clerk reads, and you nod.', MIRA)).toEqual([]);
    expect(personViolations('Mira\'s coat is back on her shoulders.', MIRA)).toEqual([{ tag: 'person', quote: expect.stringContaining('Mira\'s coat') }]);
    expect(personViolations('You watch the miracle of a working pump.', MIRA)).toEqual([]);
  });

  it('is no obligation without names, and none of any other mode', () => {
    expect(obligationsFor({ mode: 'set-piece', person: null })).toEqual([]);
    expect(obligationsFor({ mode: 'set-piece', person: { names: [] } })).toEqual([]);
    expect(obligationsFor({ mode: 'round', person: MIRA }).some(o => o.kind === 'person')).toBe(false);
  });
});

describe('narrateSessionVignette holds an opening to "you" before it posts', () => {
  const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
  const narrations = () => apiPost.mock.calls.map(c => c[2]).filter(b => String(b.system?.[0]?.text ?? '').startsWith('## NARRATOR ROLE AND VOICE'));
  const THIRD = 'Mira is counting the water ration for the third time, her thumb on the gauge.';
  const SECOND = 'You count the water ration for the third time, your thumb on the gauge.';
  const state = () => game.settings.get(MODULE_ID, 'campaignState');

  beforeEach(() => {
    vi.clearAllMocks();
    ChatMessage._reset();
    game.settings._store.clear();
    game.actors._reset();
    global.game.messages = { contents: [] };
    global.game.user = { id: 'gm-1', isGM: true };
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'sess-3', sessionNumber: 3, sceneTruths: [] });
    game.actors._set('a-mira', makeTestActor({ id: 'a-mira', name: 'Mira Kestrel' }));
  });

  it('an opening in the third person is asked again once, with its draft and the rule, and the second is posted', async () => {
    apiPost.mockResolvedValueOnce(reply(`${THIRD}${SIDECAR}`)).mockResolvedValue(reply(`${SECOND}${SIDECAR}`));
    const text = await narrateSessionVignette({ userMessage: 'OPENING VIGNETTE — begin-session.', campaignState: state(), actorIds: ['a-mira'] });
    expect(text).toBe(SECOND);
    const calls = narrations();
    expect(calls).toHaveLength(2);
    const again = calls[1].messages[0].content;
    expect(again).toContain('## YOUR DRAFT — NOT POSTED');
    expect(again).toContain('- [person] The player\'s character is "you", for the whole narration');
    expect(again).toContain('(it says: "Mira is counting the water ration');
  });

  it('an opening told as "you" is one call', async () => {
    apiPost.mockResolvedValue(reply(`${SECOND}${SIDECAR}`));
    expect(await narrateSessionVignette({ userMessage: 'OPENING VIGNETTE — begin-session.', campaignState: state(), actorIds: ['a-mira'] })).toBe(SECOND);
    expect(narrations()).toHaveLength(1);
  });

  it('a closing cuts away from the character, and a third-person table names them: neither is asked again', async () => {
    apiPost.mockResolvedValue(reply(`Tamsin thinks of Mira as the lamps go out.${SIDECAR}`));
    await narrateSessionVignette({ userMessage: 'CLOSING VIGNETTE — end-session cutaway.', campaignState: state(), actorIds: ['a-mira'] });
    expect(narrations()).toHaveLength(1);

    vi.clearAllMocks();
    game.settings._store.set(`${MODULE_ID}.narrationPerspective`, 'third_person');
    apiPost.mockResolvedValue(reply(`${THIRD}${SIDECAR}`));
    await narrateSessionVignette({ userMessage: 'OPENING VIGNETTE — begin-session.', campaignState: state(), actorIds: ['a-mira'] });
    expect(narrations()).toHaveLength(1);
  });
});
