/**
 * STARFORGED COMPANION
 * tests/unit/planRevealNoted.test.js
 *
 * Issue #402, change 3a's R3, through the real build of a narration's extras
 * (rules/reachability.md's composition test): a who-vow's plan that the
 * beat's move fulfils is read before it is handed over, and one that does not
 * name one culprit the story has met is reported to the GM on a GM-only ◈
 * Narrative Review card, once a plan (D3: reported, not mended). Round 10's
 * a75 revealed "the foreman" — a pending draft, met — and "Talia Tolari", a
 * name the code had appended, whom the story had never met.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../src/narration/narrator.js';
import { createSkeleton } from '../../src/world/secrets.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const VOW = 'Find who is raiding the Cinder Expanse lanes';
const FOREMAN = 'The raids are run by the foreman who once collected on Mira\'s family debt, using the freight and the sealed plant as cover.';
const notes = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.worldJournalContradiction === true);

async function seat(truth, { vowId }) {
  installJournalMock();
  ChatMessage._reset();
  game.user = { id: 'gm-1', isGM: true };
  game.users = [{ id: 'gm-1', isGM: true, active: true }];
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
  game.actors._reset();
  game.actors._set('npc-tamsin', makeTestActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-tamsin', name: 'Tamsin Okoro', active: true } } } }));
  const mira = makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' });
  mira.items.contents.push({ id: 'vow-item', name: VOW, type: 'progress', parent: mira, flags: { [MODULE_ID]: { vowId } },
    system: { subtype: 'vow', rank: 'dangerous', current: 16, completed: false } });
  game.actors._set('pc-mira', mira);
  // The a2 draft: the foreman, pending.
  game.messages = { contents: [{ id: 'card-a2', timestamp: 1_000, flags: { [MODULE_ID]: { draftEntityCard: true, drafts: [
    { index: 0, type: 'connection', name: 'Foreman', status: 'pending', description: 'The dock foreman who holds the manifest.' },
  ] } } }] };
  const state = { currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3', connectionIds: ['npc-tamsin'],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' } };
  game.settings._store.set(`${MODULE_ID}.campaignState`, state);
  await createSkeleton({ kind: 'vow', subject: { type: 'vow', id: vowId, name: VOW }, truth, clues: ['a factory seal on the crates'],
    sceneId: 'sc-3', sessionId: 'sess-3' }, { byGm: true });
  return state;
}

describe('a fulfilment\'s plan, checked before it is handed over (R3)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('round 10\'s plan — the foreman, and an appended stranger — is reported to the GM, once', async () => {
    const state = await seat(`${FOREMAN} The one behind it is Talia Tolari.`, { vowId: 'vid-10' });
    await buildNarratorExtras('move_resolution', state, { endingTrackIds: ['vid-10'] });
    await vi.waitFor(() => expect(notes()).toHaveLength(1));
    const card = notes()[0];
    expect(card.whisper).toEqual(['gm-1']);
    expect(card.content).toContain('This beat reveals a plan that does not name one person the story has met.');
    expect(card.content).toContain(VOW);
    expect(card.content).toContain('names 2 people as the one behind it (Foreman; Talia Tolari, whom the story has not met)');
    expect(card.content).toContain('The plan is yours, in the Secrets panel');
    // Built again — a re-ask, a second beat — it is not told twice.
    await buildNarratorExtras('move_resolution', state, { endingTrackIds: ['vid-10'] });
    await new Promise(r => setTimeout(r, 0));
    expect(notes()).toHaveLength(1);
  });

  it('the plan as the oath decided it — the foreman alone, met — is handed over with no note', async () => {
    const state = await seat(FOREMAN, { vowId: 'vid-11' });
    await buildNarratorExtras('move_resolution', state, { endingTrackIds: ['vid-11'] });
    await new Promise(r => setTimeout(r, 0));
    expect(notes()).toHaveLength(0);
  });

  it('a beat that fulfils no vow reads no plan', async () => {
    const state = await seat(`${FOREMAN} The one behind it is Talia Tolari.`, { vowId: 'vid-12' });
    await buildNarratorExtras('move_resolution', state, {});
    await new Promise(r => setTimeout(r, 0));
    expect(notes()).toHaveLength(0);
  });
});
