/**
 * STARFORGED COMPANION
 * tests/unit/xcardPersistWindow.test.js
 *
 * XCARD-PERSIST-WINDOW — an X-Card landing between a sidecar's apply and its
 * persist is re-checked in the persist's chained write.
 *
 * applySidecar reads the store's ledgers when the sidecar is applied (issue
 * #345 AA04), and the persist (persistSceneLedgerFields → mergeSceneLedgers)
 * re-retracted only the X-carded narration's own ids. So a narration whose
 * sidecar was applied, its persist still queued on the write chain, while
 * the X-Card was played on the narration before it — its card not posted yet,
 * the X-Card answered the earlier one — wrote its restatement of the removed
 * fact live. The merge now re-checks each narrator truth it adds against the
 * store's retractions and blocks as they stand at its turn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { suppressScene } from '../../src/context/safety.js';
import { applySidecar } from '../../src/factContinuity/ledgers.js';
import { persistSceneLedgerFields, mergeSceneLedgers } from '../../src/factContinuity/sceneLifecycle.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-9';
const DEAD = 'Is dead';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const VANCE = { kind: 'text', text: 'Vance' };

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  // nar-1's scene has ended: its truth is kept (unnamed) for a later X-Card.
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 9, currentSceneId: 'sc-2',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-2' }, sceneFrame: null,
    sessionRetractions: { sessionId: SESSION, facts: [], blocked: [],
      narrated: [{ label: 'Vance', fact: DEAD, subjectKey: 'vance', narrationId: 'nar-1', truthId: 'tr-old' }] },
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
  });
});

async function postNar1Card() {
  const card = await ChatMessage.create({ content: '<p>Vance falls.</p>', flags: { [MODULE_ID]: {
    narratorCard: true, narrationText: 'Vance falls.', sessionId: SESSION, narrationId: 'nar-1',
  } } });
  global.game.messages = { contents: ChatMessage._created.slice() };
  return card;
}

describe('XCARD-PERSIST-WINDOW — the persist re-checks the X-Card it did not see at apply', () => {
  it('a restatement applied before the X-Card on the earlier narration is not written live', async () => {
    await postNar1Card();
    // nar-2's sidecar is applied on a working copy — nothing blocks it yet.
    const working = foundry.utils.deepClone(stored());
    applySidecar({ newTruths: [{ subject: 'Vance', fact: DEAD }], stateChanges: [] },
      { campaignState: working, narrationId: 'nar-2', storedLedger: stored() });
    expect(working.sceneTruths.map(t => t.fact)).toEqual([DEAD]);           // control: applied

    // The X-Card lands before nar-2's persist has its turn (nar-2's card is not posted).
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-1']);
    expect(stored().sessionRetractions.blocked.map(b => b.fact)).toEqual([DEAD]);

    await persistSceneLedgerFields(working, ['sceneTruths', 'sceneState', 'sceneFrame'], 'narrator sidecar');
    expect(stored().sceneTruths.filter(t => t.fact === DEAD && !t.retracted)).toEqual([]);
  });

  it('a restatement of a scene truth the X-Card retracted in the store is not appended', () => {
    const latest = {
      currentSessionId: SESSION, currentSceneId: 'sc-2',
      sceneTruths: [{ id: 'tr-1', subject: VANCE, fact: DEAD, narrationId: 'nar-1', retracted: true, retractedBy: 'xcard' }],
    };
    const working = {
      currentSessionId: SESSION, currentSceneId: 'sc-2',
      sceneTruths: [
        { id: 'tr-1', subject: VANCE, fact: DEAD, narrationId: 'nar-1', retracted: false },
        { id: 'tr-2', subject: VANCE, fact: 'is dead.', narrationId: 'nar-2', asserter: 'narrator', retracted: false },
        { id: 'tr-3', subject: VANCE, fact: 'Took the shuttle', narrationId: 'nar-2', asserter: 'narrator', retracted: false },
      ],
    };
    mergeSceneLedgers(working, latest);
    expect(working.sceneTruths.map(t => t.id)).toEqual(['tr-1', 'tr-3']);
    expect(working.sceneTruths[0].retractedBy).toBe('xcard');
  });

  it('control: a GM\'s truth, and a re-narration after a superseded one, are written', () => {
    const latest = {
      currentSessionId: SESSION, currentSceneId: 'sc-2',
      sceneTruths: [
        { id: 'tr-1', subject: VANCE, fact: DEAD, narrationId: 'nar-1', retracted: true, retractedBy: 'xcard' },
        { id: 'tr-4', subject: VANCE, fact: 'Owes the crew', narrationId: 'nar-0', retracted: true, retractedBy: 'superseded' },
      ],
    };
    const working = {
      currentSessionId: SESSION, currentSceneId: 'sc-2',
      sceneTruths: [
        { id: 'tr-2', subject: VANCE, fact: DEAD, asserter: 'gm', source: 'manual_truth_cmd', retracted: false },
        { id: 'tr-5', subject: VANCE, fact: 'Owes the crew', narrationId: 'nar-3', asserter: 'narrator', retracted: false },
      ],
    };
    mergeSceneLedgers(working, latest);
    expect(working.sceneTruths.map(t => t.id)).toEqual(['tr-1', 'tr-4', 'tr-2', 'tr-5']);
  });
});
