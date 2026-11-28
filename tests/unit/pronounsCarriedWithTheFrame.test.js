/**
 * STARFORGED COMPANION
 * tests/unit/pronounsCarriedWithTheFrame.test.js
 *
 * Issue #402, change 2, on round 10's recording: a carry-over written by code
 * at every scene and session end. Round 10's customs clerk was "her" from a26
 * to a43 ("A customs clerk in a gray vest … glances once at the cargo
 * manifest on her panel … she says") and "he" at a53, after the session break:
 * a pronoun lived only on a card, and the clerk had none. a47's opening was
 * told "With them at the end: customs clerk", and nothing more.
 *
 * A fact block's `present` and `remote` entries may now carry a pronoun. The
 * recorded blocks were written before they could, so a26's clerk entry is
 * marked here as its narration now would write it — her prose's own "she";
 * every other block is the run's as recorded. Done when: a47's stop reads
 * "customs clerk (she/her)", and a53's request holds it.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import {
  narrateOracleFollowup, narrateSessionVignette, buildNarratorExtras, applyNarratorSidecar,
} from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';
import { composeOpeningScene } from '../../src/session/galleyVignette.js';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';
import { applySceneFrame } from '../../src/factContinuity/ledgers.js';
import { buildRecordedIdentitiesBlock } from '../../src/factContinuity/consistencyCheck.js';
import { recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { seedSessionRecord, recordedEvent } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const RUN = fileURLToPath(new URL('../../test/ci/playwright/explorations/long-haul-live-20261127-202557/replay.json', import.meta.url));
const exchanges = JSON.parse(readFileSync(RUN, 'utf8')).recording.exchanges;
const textOf = (e) => (typeof e?.response === 'object' ? e.response?.content?.[0]?.text : e?.response) ?? '';
const recorded = (step, kind) => textOf(exchanges.find(e => e.step === step && new RegExp(`${kind}$`).test(e.kind)));
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

const A26 = recorded('a26', 'narrateResolution');
const A43 = recorded('a43', 'narrateOracleFollowup');
const A47 = recorded('a47', 'narrateSessionVignette');
const A53 = recorded('a53', 'narratePacedInput');
// a26's clerk entry, as its narration now writes it: her prose's "she".
const A26_MARKED = A26.replace('"present": ["Mira Kestrel", "customs clerk"]', '"present": ["Mira Kestrel", "customs clerk (she/her)"]');
const CLERK = [{ name: 'customs clerk', pronouns: 'she/her' }];

const BLEAK = { id: 'act-bleak', name: 'Bleakhold Station' };
const QUESTION = 'Is anyone left alive aboard the Cinder Wren?';
const CARD = {
  id: 'card-a43', author: { id: 'pl-1' },
  flags: { [MODULE_ID]: {
    oracleCommandCard: true,
    oracleNarration: { kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (likely)', question: QUESTION, rolledLine: 'd100 = 3 → YES' },
    oracleMemory: { name: 'Ask the Oracle (likely)', question: QUESTION, answer: 'YES' },
  } },
};
const mira = () => ({ active: [{ actor: game.actors.get('pc-mira') }], absent: [] });
/** The opening's narration answered with a47's recorded reply; any other call (the campaign recap it reads) with a line. */
const answerTheOpening = () => apiPost.mockImplementation(async (_url, _headers, body) => {
  const user = String(body?.messages?.[0]?.content ?? '');
  return reply(/^OPENING VIGNETTE/.test(user) ? A47 : 'The story so far.');
});
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

let journals;
beforeEach(async () => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  journals = installJournalMock();
  _resetRecordForTests();
  _resetSummaryViewForTests();
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.game.messages = { contents: [CARD], get: (id) => (id === CARD.id ? CARD : null) };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  game.actors._set(BLEAK.id, makeTestActor({ id: BLEAK.id, name: BLEAK.name, type: 'location',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: BLEAK.name } } } }));
  const state = {
    currentSessionId: 's-2', sessionNumber: 2, currentSceneId: 'sc-s-2', sessionActive: true,
    currentLocationId: BLEAK.id, currentLocationType: 'settlement', settlementIds: [BLEAK.id],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-s-2' }, sceneFrame: null,
  };
  // a26's frame, as its fact block now gives it.
  applySceneFrame(extractSidecar(A26_MARKED).sidecar.sceneFrame, state, { narrationId: 'nar-a26' });
  game.settings._store.set(KEY, state);
  await seedSessionRecord('s-2', [
    recordedEvent('s-2', 'session.begun', { d: { number: 2, table: {} } }),
    recordedEvent('s-2', 'scene.started', { d: { sceneId: 'sc-s-2', reason: 'arrival', cause: 'place', what: 'the ship arrives',
      place: { id: BLEAK.id, type: 'settlement', name: BLEAK.name } } }),
  ], { number: 2 });
});
afterEach(() => journals.restore());

/** a43, the session's last beat, replayed through the real follow-up. */
async function a43() {
  apiPost.mockResolvedValueOnce(reply(A43));
  await narrateOracleFollowup({
    kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (likely)', question: QUESTION, rolledLine: 'd100 = 3 → YES',
    campaignState: structuredClone(stored()), speakerActorId: null, oracleCardId: CARD.id,
  });
  await vi.waitFor(() => expect(stored().sceneFrame?.location).toBe('Bleakhold Station dock ring'));
  await recordSettled();
}

/** The break: session 3 begins where session 2 stopped. */
async function sessionThree() {
  game.settings._store.set(KEY, { ...stored(), currentSessionId: 's-3', sessionNumber: 3, currentSceneId: null, sceneFrame: null,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } });
  return composeOpeningScene(mira(), stored(), { draw: () => 50 });
}

describe('round 10: a person\'s pronouns are carried with the frame (issue #402, change 2)', () => {
  it('reads the kept run (setup): a26\'s prose gives the clerk "she"; a53\'s gives "he"', () => {
    expect(A26).toMatch(/she says/);
    expect(A26).toContain('"present": ["Mira Kestrel", "customs clerk"]');
    expect(A53).toMatch(/"Cinder Wren," he says/);
  });

  it('an entry\'s mark is kept apart from its name, and the first set given stands for the scene', async () => {
    const frame = extractSidecar(A26_MARKED).sidecar.sceneFrame;
    expect(frame.present).toEqual(['Mira Kestrel', 'customs clerk']);
    expect(frame.pronouns).toEqual(CLERK);
    // a43's block gives the clerk no set: the scene keeps hers.
    const state = stored();
    applySceneFrame(extractSidecar(A43).sidecar.sceneFrame, state, { narrationId: 'nar-a43' });
    expect(state.sceneFrame.present).toEqual(['Mira Kestrel', 'customs clerk']);
    expect(state.sceneFrame.pronouns).toEqual(CLERK);
    // A later set for her does not replace it.
    applySceneFrame({ location: 'dock', present: ['customs clerk'], situation: 's', pronouns: [{ name: 'customs clerk', pronouns: 'he/him' }] }, state);
    expect(state.sceneFrame.pronouns).toEqual(CLERK);
  });

  it('a47: the opening\'s stop reads "customs clerk (she/her)", and its scene is given her', async () => {
    await a43();
    const { userMessage, carry } = await sessionThree();
    expect(userMessage).toContain('  With them at the end: customs clerk (she/her).');
    expect(carry).toEqual({ present: ['customs clerk'], pronouns: CLERK, place: BLEAK.name });
  });

  it('a53: the next session\'s first scene, at that place, holds her — and a53\'s request says so', async () => {
    await a43();
    const { userMessage, carry } = await sessionThree();
    answerTheOpening();   // a47, as recorded: no fact block
    const cs = structuredClone(stored());
    await narrateSessionVignette({ userMessage, campaignState: cs, carry });
    await vi.waitFor(() => expect(stored().currentSceneId).toBeTruthy());
    const frame = stored().sceneFrame;
    expect(frame.present).toEqual(['customs clerk']);
    expect(frame.pronouns).toEqual(CLERK);
    // a53's request: THE SCENE names her with her pronouns.
    const extras = await buildNarratorExtras('paced_narrative', stored(), { playerNarration: 'What is the raider cutter called?' });
    const system = buildNarratorSystemPrompt(stored(), {}, null, '', extras);
    expect(system).toContain('  Present:  customs clerk (she/her)');
    // a53's own block gives none: she stays "she/her" in the frame — and its
    // "he" is the pronoun check's, logged and asked of no one again.
    const info = vi.spyOn(console, 'info');
    const state = stored();
    applyNarratorSidecar(A53, state, { narrationId: 'nar-a53', mode: 'paced_narrative' });
    expect(state.sceneFrame.pronouns).toEqual(CLERK);
    expect(info.mock.calls.flat().join('\n')).toContain('pronouns: customs clerk (she/her) written "he" — logged only.');
    info.mockRestore();
  });

  it('the next session\'s first scene at another place is given no one', async () => {
    await a43();
    const { userMessage, carry } = await sessionThree();
    game.actors._set('act-spire', makeTestActor({ id: 'act-spire', name: 'Hollow Spire', type: 'location',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-spire', name: 'Hollow Spire' } } } }));
    game.settings._store.set(KEY, { ...stored(), currentLocationId: 'act-spire' });
    answerTheOpening();
    await narrateSessionVignette({ userMessage, campaignState: structuredClone(stored()), carry });
    await vi.waitFor(() => expect(stored().currentSceneId).toBeTruthy());
    expect(stored().sceneFrame ?? null).toBeNull();
  });

  it('the audit\'s recorded identities hold her; a recorded person\'s card wins over the frame\'s set', () => {
    const frame = { present: ['customs clerk', 'Tamsin Okoro'], pronouns: [...CLERK, { name: 'Tamsin Okoro', pronouns: 'he/him' }] };
    game.actors._set('npc-tamsin', makeTestActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character', system: { pronouns: 'she/her' },
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-tamsin', name: 'Tamsin Okoro', active: true, pronouns: 'she/her' } } } }));
    const block = buildRecordedIdentitiesBlock(['npc-tamsin'], { frame });
    expect(block).toContain('  customs clerk — she/her');
    expect(block).toContain('  Tamsin Okoro — she/her');
    expect(block).not.toContain('he/him');
  });
});
