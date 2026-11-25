/**
 * STARFORGED COMPANION
 * tests/unit/offeredRollGoesOnFromItsOffer.test.js
 *
 * Issue #388 #14 (BEAT-TOLD-TWICE). A line the reader offers a move on is
 * narrated on its card; the card's Roll posts the same line again as the
 * move, and its narration was told it as a new line — so it told it again.
 * The fifth live long haul's beat 23 told each offered Develop twice (a61 →
 * a62: "She listens without touching it … 'Who told you my name?'", then
 * "Tamsin hears the whole of it without touching the compass … 'Who?'"), and
 * the pen was given three times. Now the Roll's line says it was narrated on
 * its offer (`fromOffer`), its resolution is the offer's (`inputMethod:
 * "offer"`), and its narration is told the line is told: it goes on from
 * where the offer's narration ends.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, isReaderCall, readerReply } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { bondItemFor } from '../helpers/fullStateFixture.js';
import { buildNarratorUserMessage } from '../../src/narration/narratorPrompt.js';

const LINE = "I give Tamsin the brass star-compass's story, and tell her what I've learned about the raids.";
const OFFERED = readerReply({ move: 'develop_your_relationship', risk: 'slight', category: 'social' });
const NARRATION = 'Tamsin listens without touching the compass.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const TOLD = 'This line was narrated before the move was made: that narration is in RECENT SCENE, above. It is told. '
  + 'Go on from where it ends — tell what the move decides, and do not tell the line, or anything that narration already told, again.';

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'off-s1', sessionNumber: 3,
      currentSceneId: 'off-scene', sceneTruths: [], clocks: [], connectionIds: ['npc-tamsin'] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 }, items: { contents: [bondItemFor({
    _id: 'rec-tamsin', name: 'Tamsin Okoro', rank: 'dangerous', relationshipTicks: 16, bonded: false,
  })] } });
  table.addActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character', flags: { [MODULE_ID]: { entityType: 'connection', connection: {
    _id: 'rec-tamsin', name: 'Tamsin Okoro', rank: 'dangerous', role: 'Broker', relationshipTicks: 16, bonded: false, active: true, history: [],
  } } } });
  scriptClaude(table, { fallback: (call) => (isReaderCall(call) ? '{}' : NARRATION) }).when(isReaderCall, OFFERED);
});

const narrations = () => table.claude.calls.filter(c => /## PLAYER NARRATION/.test(c.userText));

describe('a move rolled from its offer goes on from the offer\'s narration (issue #388 #14)', () => {
  it('the offer narrates the line; its Roll is told the line is told, and its resolution is the offer\'s', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-mira', alias: 'Mira Kestrel' } });
    await table.settle(); await table.drain();
    const [card] = table.cards(f => f.narratorCard && f.pacedNarrative === true);
    expect(card?.flags[MODULE_ID].suggestedMove).toBe('develop_your_relationship');
    const before = narrations().length;

    table.client('pl-1').click(card._id ?? card.id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();

    const [forced] = table.cards(f => f.forcedMoveId === 'develop_your_relationship');
    expect(forced.flags[MODULE_ID].fromOffer).toBe(true);
    const roll = narrations().slice(before);
    expect(roll).toHaveLength(1);
    expect(roll[0].userText).toContain(`Mira Kestrel: "${LINE}"`);
    expect(roll[0].userText).toContain(TOLD);
    // The offer's own narration is no move's: it is not told so.
    expect(narrations().slice(0, before).some(c => c.userText.includes(TOLD))).toBe(false);
  }, 30_000);

  it('a line rolled as it was typed is a new line: it is told to narrate it', () => {
    const resolution = { moveId: 'face_danger', outcome: 'strong_hit', loremasterContext: 'Face Danger — strong hit' };
    expect(buildNarratorUserMessage(resolution, 'I brace the hatch.', 3, 'Mira Kestrel')).not.toContain('This line was narrated before');
    expect(buildNarratorUserMessage(resolution, 'I brace the hatch.', 3, 'Mira Kestrel', '', { toldBefore: true })).toContain(TOLD);
    // No line, nothing to say of it.
    expect(buildNarratorUserMessage(resolution, '', 3, 'Mira Kestrel', '', { toldBefore: true })).not.toContain('This line was narrated before');
  });
});
