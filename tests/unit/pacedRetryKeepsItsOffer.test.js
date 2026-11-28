/**
 * STARFORGED COMPANION
 * tests/unit/pacedRetryKeepsItsOffer.test.js
 *
 * Issue #399's bug audit, N31 (outside the judge; listed so it does not ride
 * along unlisted): a paced line offered a journey — "take the Kobayashi IV to
 * Bleakhold Station", offered Set a Course — narrates on its rate-limit retry
 * with its offer, as its first try does. The retry applied its fact block
 * without it, so a binding ship change moved the ship before the roll: the
 * SHIP-BOUND-FOR-READ-AS-NEAR rule (issue #389 #8) held on the first try only.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildCampaignTruthsBlock: vi.fn(async () => ''),
}));

import { apiPost } from '../../src/api-proxy.js';
import { narratePacedInput } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const position = () => game.actors.get('actor-ship').flags[MODULE_ID].ship.position;
const LINE = 'I take the Kobayashi IV in to dock at Bleakhold Station.';
const SIDECAR = { newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', value: 'docked at Bleakhold Station', from: 'line' }] };
const REPLY = `You lay the heading in for Bleakhold Station and the console takes it.\n\`\`\`json\n${JSON.stringify(SIDECAR)}\n\`\`\``;
const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
  for (const [id, name] of [['act-bleak', 'Bleakhold Station'], ['act-spire', 'Hollow Spire']]) {
    game.actors._set(id, makeTestActor({ id, name, type: 'location',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name } } } }));
  }
  game.actors._set('actor-ship', makeTestActor({ id: 'actor-ship', type: 'starship', name: 'Kobayashi IV',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-ship', name: 'Kobayashi IV', isCommandVehicle: true,
      position: { nearestSettlementId: null, nearestPlanetId: null, sectorId: null, freeText: 'out past the ring', updatedBy: 'expedition' } } } } }));
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    shipIds: ['actor-ship'], settlementIds: ['act-bleak', 'act-spire'], xCardActive: false, xCardPlays: 0,
  });
});

describe('the paced retry keeps its offer (issue #399\'s audit N31)', () => {
  it('a 429 on the first try: the retry\'s binding ship change is dropped while Set a Course is offered, as the first try\'s is', async () => {
    let narrations = 0;
    apiPost.mockImplementation(async (_url, _headers, _body, opts) => {
      if (String(opts?.label ?? '').startsWith('narrator:narratePacedInput')) {
        narrations += 1;
        if (narrations === 1) throw new Error('Anthropic API error 429: rate limited');
        return reply(REPLY);
      }
      return reply(opts?.label === 'consistencyCheck' ? '{"contradictions":[]}' : '{"violations":[]}');
    });
    // The retry waits out its five seconds (narrator.js RETRY_DELAY_MS) in real time.
    const text = await narratePacedInput(LINE, stored(), { suggestedMove: 'set_a_course', speakerActorId: 'pc-mira' });
    expect(narrations).toBe(2);
    expect(text).toMatch(/^You lay the heading in for Bleakhold Station/);
    await new Promise(r => setTimeout(r, 300));
    expect(position()).toMatchObject({ nearestSettlementId: null, freeText: 'out past the ring' });
  }, 15000);
});
