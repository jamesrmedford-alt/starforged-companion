/**
 * STARFORGED COMPANION
 * tests/unit/buttonMoveGivesNoWords.test.js
 *
 * Issue #388 #10 (BUTTON-ROLL-SPEAKS-FOR-THE-CHARACTER). A move pressed on a
 * card posts the card's own words for it — "Develop my relationship with
 * Tamsin Okoro." — and the move's narration was told them as the
 * character's line ("## PLAYER NARRATION — spoken by Mira Kestrel"). The
 * fifth live long haul's a82, a bonded Develop pressed on a card, was told
 * "You tell Tamsin plainly that she is the one person on these docks you
 * would trust with the ship's secrets"; the Chronicle filed it, and a85's
 * answer quoted it as Mira's words. The recent-scene ring said "PLAYER —
 * Mira Kestrel wrote: \"Attempt to fulfill your vow.\"".
 *
 * Now a card's line is `madeLine`: its move's resolution is the button's
 * (`inputMethod: "button"`), its narration is shown the card's words as the
 * card's, with NOT SO [unsaid] — the character says nothing — and its card
 * keeps no line of the player's.
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
import { scriptClaude, isReaderCall } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { bondItemFor } from '../helpers/fullStateFixture.js';
import { obligationsFor, formatObligationsBlock } from '../../src/moves/contracts/obligations.js';
import { trippedLines } from '../../src/moves/contracts/checks.js';
import { buildNarratorUserMessage } from '../../src/narration/narratorPrompt.js';

const CARD_LINE = 'Develop my relationship with Tamsin Okoro.';
const A82 = 'You tell Tamsin plainly that she is the one person on these docks you would trust with the ship\'s secrets. '
  + 'She takes it slowly, her thumb still on the counter edge.';
const NARRATION = 'Tamsin sets the pen down and lets the stall go quiet.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

describe('a move pressed on a card gives the character no words (issue #388 #10)', () => {
  const RESOLUTION = { moveId: 'develop_your_relationship', outcome: null, loremasterContext: '[MOVE: Develop Your Relationship]' };

  it('its obligations hold NOT SO [unsaid], and a82\'s narration trips it to the judge', () => {
    const made = obligationsFor({ mode: 'move', resolution: RESOLUTION, madeLine: true });
    const unsaid = made.find(o => o.kind === 'unsaid');
    expect(unsaid).toMatchObject({ list: 'NOT SO', judge: expect.stringContaining('The player\'s character ("you") speaks') });
    expect(formatObligationsBlock(made)).toContain('- [unsaid] No line of the player\'s made this move — it was made from a button or the map.');
    expect(trippedLines(A82, made).map(o => o.kind)).toContain('unsaid');
    // A typed line's move has no such line.
    expect(obligationsFor({ mode: 'move', resolution: RESOLUTION }).map(o => o.kind)).not.toContain('unsaid');
  });

  it('its prompt shows the card\'s words as the card\'s — never as the character\'s line', () => {
    const user = buildNarratorUserMessage(RESOLUTION, CARD_LINE, 3, 'Mira Kestrel', '', { madeLine: true });
    expect(user).toContain(`## THE MOVE — made from a button or the map; the player wrote no line\n\nIts words on the table: "${CARD_LINE}"`);
    expect(user).not.toContain('## PLAYER NARRATION');
    expect(user).toContain('- [unsaid]');
    const typed = buildNarratorUserMessage(RESOLUTION, 'I sit with Tamsin while she counts the ledger.', 3, 'Mira Kestrel');
    expect(typed).toContain('## PLAYER NARRATION — spoken by Mira Kestrel');
    expect(typed).not.toContain('[unsaid]');
  });
});

describe('the card\'s move, end to end', () => {
  let table;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'btn-s1', sessionNumber: 3,
        currentSceneId: 'btn-scene', sceneTruths: [], clocks: [], connectionIds: ['npc-tamsin'] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 }, items: { contents: [bondItemFor({
      _id: 'rec-tamsin', name: 'Tamsin Okoro', rank: 'dangerous', relationshipTicks: 16, bonded: false,
    })] } });
    table.addActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character', flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-tamsin', name: 'Tamsin Okoro', rank: 'dangerous', role: 'Broker', relationshipTicks: 16, bonded: false, active: true, history: [],
    } } } });
    scriptClaude(table, { fallback: (call) => (isReaderCall(call) ? '{}' : NARRATION) });
  });

  it('the card\'s line is the button\'s: its narration is told so, and its card keeps no line of the player\'s', async () => {
    // As applyConnectionPick posts it: the GM's post, spoken as the roller.
    await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: CARD_LINE, speaker: { actor: 'pc-mira', alias: 'Mira Kestrel' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'develop_your_relationship', deferWhileBusy: true, madeLine: true,
        forcedMoveTarget: 'Tamsin Okoro', forcedMoveTargetId: 'npc-tamsin' } },
    }));
    await table.settle(); await table.drain();

    const [narration] = table.claude.calls.filter(c => /## THE MOVE — made from a button or the map/.test(c.userText));
    expect(narration, 'the move was narrated as pressed on a card').toBeTruthy();
    expect(narration.userText).toContain(`Its words on the table: "${CARD_LINE}"`);
    expect(narration.userText).not.toContain('Mira Kestrel: "Develop my relationship');
    expect(narration.userText).toContain('- [unsaid]');
    const [card] = table.cards(f => f.narratorCard && !f.pacedNarrative && typeof f.narrationText === 'string');
    expect(card.flags[MODULE_ID].playerText ?? '').toBe('');
  }, 30_000);
});
