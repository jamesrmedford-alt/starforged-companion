/* global makeTestActor -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/recapAtFirstBegin.test.js
 *
 * RECAP-AT-THE-FIRST-BEGIN (the long haul's free rehearsal, 2026-11-24; issue
 * #382 slice 2's defect). A session's first narration is given the campaign
 * recap as CAMPAIGN RECAP — SESSION START CONTEXT (narrator.js
 * sessionStartRecap): what came before the session. Since the recap became a
 * view of the session record, its source counts the session's own beats — and
 * a campaign's first session has one before its first narration, the vow
 * sworn in the Begin dialog ("[s1-1] Mira Kestrel — Momentum 2 → 3"). So the
 * source was not empty, a recap call was made, and the opening narration was
 * given a recap of the session it opened. Before slice 2 the Chronicle was
 * empty there and no recap was made until the first session's end.
 *
 * Now the session's start is told a recap only when there is a session before
 * it (recapView.js recapSource `before`: a recorded session that holds a beat,
 * or one from before the record; or a session numbered past the first). End a
 * Session's and `!recap`'s recaps still tell the session under way.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const api = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    api.calls.push({ user });
    if (user.includes('## THE RECORD')) {
      const id = /\[(s\d+-\d+)\]/.exec(user)?.[1] ?? 's1-1';
      return { content: [{ type: 'text', text: JSON.stringify({ paragraphs: [[{ text: 'Mira swore to find the lost ark.', because: [id] }]] }) }],
        stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
    }
    return { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));

import { buildNarratorExtras, getCampaignRecap } from '../../src/narration/narrator.js';
import { recapSource } from '../../src/record/recapView.js';
import { readRecord } from '../../src/record/read.js';
import { _resetRecordForTests } from '../../src/record/record.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { recordedEvent, recordSourceOf, seedSessionRecord } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const recapCalls = () => api.calls.filter(c => c.user.includes('## THE RECORD'));
const who = { actor: 'pc-mira' };

/** A session's Begin, as the dialog records it: the session begun, the vow sworn, its momentum. */
const begun = (sessionId, number) => [
  recordedEvent(sessionId, 'session.begun', { d: { number } }),
  recordedEvent(sessionId, 'vow.sworn', { who, ref: { vow: `vow-${sessionId}` }, d: { name: 'Find the lost ark', rank: 'dangerous', actorId: 'pc-mira' } }),
  recordedEvent(sessionId, 'sheet.changed', { who, d: { actorId: 'pc-mira', what: 'momentum', from: 2, to: 3, cause: { kind: 'move' } } }),
];

let journals;
beforeEach(() => {
  api.calls.length = 0;
  journals = installJournalMock();
  _resetRecordForTests();
  _resetSummaryViewForTests();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
  game.actors._reset();
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
});
afterEach(() => { journals.restore(); game.actors._reset(); });

const stateOf = (sessionId, number) => {
  const state = { ...CampaignStateSchema, currentSessionId: sessionId, sessionNumber: number, sessionStartedId: sessionId, sessionActive: true };
  game.settings._store.set(`${MODULE_ID}.campaignState`, state);
  return state;
};

describe('RECAP-AT-THE-FIRST-BEGIN — a campaign\'s first session opens with no recap of itself', () => {
  it('its first narration is given no recap, and no recap call is made', async () => {
    await seedSessionRecord('sess-1', begun('sess-1', 1), { number: 1 });
    const extras = await buildNarratorExtras('paced_narrative', stateOf('sess-1', 1));
    expect(extras.campaignRecap).toBe('');           // was: "Mira swore to find the lost ark."
    expect(recapCalls()).toEqual([]);                // was: one recap call, of the session it opened
  });

  it('control: a session with one before it opens with the recap', async () => {
    await seedSessionRecord('sess-1', begun('sess-1', 1), { number: 1, createdAt: Date.now() - 7_200_000 });
    await seedSessionRecord('sess-2', begun('sess-2', 2), { number: 2 });
    const extras = await buildNarratorExtras('paced_narrative', stateOf('sess-2', 2));
    expect(extras.campaignRecap).toBe('Mira swore to find the lost ark.');
    expect(recapCalls().length).toBeGreaterThan(0);   // a second asks after the vow it left untold
  });

  it('control: the first session\'s own recap — End a Session\'s, `!recap`\'s — still tells it', async () => {
    await seedSessionRecord('sess-1', begun('sess-1', 1), { number: 1 });
    expect(await getCampaignRecap(stateOf('sess-1', 1))).toBe('Mira swore to find the lost ark.');
    expect(recapCalls()).toHaveLength(1);
  });
});

describe('recapSource `before` — a session before the current one', () => {
  const sourceOf = (pages, current) => recapSource({
    read: readRecord({ session: 'campaign' }, { ...recordSourceOf('x', []), pages, currentSessionId: current }),
    currentSessionId: current,
  });
  const page = (sessionId, events, createdAt) => ({ ...recordSourceOf(sessionId, events).pages[0], createdAt });

  it('the current session\'s own beats are none; an earlier session\'s are; an earlier session with no beat is none', () => {
    expect(sourceOf([page('sess-1', begun('sess-1', 1), 1)], 'sess-1')).toMatchObject({ empty: false, before: false });
    expect(sourceOf([page('sess-1', begun('sess-1', 1), 1), page('sess-2', begun('sess-2', 2), 2)], 'sess-2').before).toBe(true);
    expect(sourceOf([page('sess-0', [recordedEvent('sess-0', 'session.begun', { d: { number: 1 } })], 1), page('sess-1', begun('sess-1', 2), 2)], 'sess-1').before).toBe(false);
  });

  it('a session from before the record is one', () => {
    expect(recapSource({ read: { sessions: [] }, earlier: [{ label: 'Session 1, its Session Log story', text: 'They fled.' }], currentSessionId: 'sess-2' }).before).toBe(true);
  });
});
