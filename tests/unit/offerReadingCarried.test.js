/**
 * STARFORGED COMPANION
 * tests/unit/offerReadingCarried.test.js
 *
 * Overhaul 1, slice 3 (issue #384): an offer carries its reading to its
 * button. A typed line the line reader reads as a move, and the dials offer
 * rather than roll, posts a paced card whose Roll button carries the
 * reading's stat, target and stakes (flags.offerReading). Pressing it, the
 * GM's relay forwards that reading with the forced move (forcedReading), and
 * the Roll is made as read: no reader is asked again. Only a GM's post is
 * trusted; a player's own post that claims a reading is read again.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ confirmed: [] }));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
// The confirm dialog: record what it was shown, then accept.
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async (interp) => {
    control.confirmed.push({ moveId: interp.moveId, statUsed: interp.statUsed, offerRead: interp.offerRead === true });
    return true;
  }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, isReaderCall, readerModeOf, readerReply } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const LINE = 'I go quietly down the clerk\'s manifests, looking for the cutter\'s berth.';
const NARRATION = 'The clerk\'s lamp gutters over the ledgers.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// Read as Face Danger +shadow, slight: offered at the exploration dial, never rolled at once.
const OFFERED = readerReply({ move: 'face_danger', risk: 'slight', category: 'exploration', stat: 'shadow',
  stakes: { hit: 'You find the cutter\'s berth.', miss: 'The clerk notices the pages turned.' } });

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirmed.length = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'or-s1', sessionNumber: 1, currentSceneId: 'or-scene', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => (isReaderCall(call) ? readerReply({ move: 'face_danger', stat: 'wits', risk: 'plain' }) : NARRATION) })
    .when((call) => readerModeOf(call) === 'open', OFFERED);
});

const pacedCards = () => table.cards(f => f.narratorCard && f.pacedNarrative === true);

describe('an offer carries its reading to its button', () => {
  it('the card holds the reading; its Roll is made as read, and no reader is asked again', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-mira', alias: 'Mira Kestrel' } });
    await table.settle(); await table.drain();
    const [card] = pacedCards();
    expect(card, 'the line was narrated with the move offered').toBeTruthy();
    expect(card.flags[MODULE_ID]).toMatchObject({ suggestedMove: 'face_danger',
      offerReading: { moveId: 'face_danger', statUsed: 'shadow', stakes: { hit: 'You find the cutter\'s berth.' } } });

    const before = table.claude.calls.length;
    table.client('pl-1').click(card._id ?? card.id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();

    const [forced] = table.cards(f => f.forcedMoveId === 'face_danger');
    expect(forced, 'the forced move was posted').toBeTruthy();
    expect(forced.flags[MODULE_ID].forcedReading).toMatchObject({ moveId: 'face_danger', statUsed: 'shadow' });
    expect(control.confirmed).toEqual([{ moveId: 'face_danger', statUsed: 'shadow', offerRead: true }]);
    expect(table.claude.calls.slice(before).filter(isReaderCall), 'no second reading').toEqual([]);
  }, 30_000);

  it('a player\'s own post claiming a reading is not trusted: the move is read again', async () => {
    await table.client('pl-1').chat(LINE, {
      speaker: { actor: 'pc-mira', alias: 'Mira Kestrel' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger',
        forcedReading: { moveId: 'face_danger', statUsed: 'iron', stakes: null } } },
    });
    await table.settle(); await table.drain();
    expect(table.claude.calls.filter(call => readerModeOf(call) === 'chosen'), 'read for its stat, as any forced move is').toHaveLength(1);
    expect(control.confirmed.map(c => c.offerRead)).toEqual([false]);
  }, 30_000);
});
