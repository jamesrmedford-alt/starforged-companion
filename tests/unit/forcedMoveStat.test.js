/**
 * STARFORGED COMPANION
 * tests/unit/forcedMoveStat.test.js
 *
 * A forced move rolls the stat its narration fits (issue #321 U04). The
 * pacing "Roll ⟨move⟩" button, the way-out buttons and the Battle button post
 * a forced move, which skips the interpreter: its stat was the move's first
 * listed one, so every forced Face Danger, Secure an Advantage, Enter the
 * Fray, Gain Ground or Battle rolled +edge and every Heal +iron, whatever the
 * player had described. The pipeline now reads the stat with a stat-only
 * interpretation (interpretMove with the move as its expectedMoveSlug); the
 * confirm dialog shows it.
 *
 * End to end on a booted table (tests/helpers/multiClient.js): the player
 * clicks the GM-authored card's button on their own client, the canonical
 * GM's pipeline runs with the GM's key, and the Claude calls are answered at
 * the fetch boundary.
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
    control.confirmed.push({ moveId: interp.moveId, statUsed: interp.statUsed });
    return true;
  }),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      // challenge 2, 3; action 6 → a strong hit (no Pay the Price, no choice card)
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.15).mockReturnValueOnce(0.25).mockReturnValueOnce(0.99);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const isInterpreter = (call) => /You are the move interpreter/.test(call.system ?? '');
const SNEAK = 'I melt into the shadows and slip past the sentries.';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirmed.length = 0;
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { edge: 1, shadow: 4 } });
  scriptClaude(table).when(isInterpreter,
    JSON.stringify({ moveId: 'face_danger', statUsed: 'shadow', confidence: 'high', rationale: 'Creeping past unseen is stealth.' }),
    { times: 5 });
});

/** A paced narrative card as the narrator posts it: prose, a move hint and its Roll button. */
async function postPacedCard(suggestedMove, playerText) {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-narration-card sf-narration-card--paced"><div class="sf-narration-prose">The corridor narrows.</div>`
      + `<div class="sf-paced-actions"><button type="button" class="sf-paced-roll-btn" data-action="sf-paced-roll">Roll it</button></div></div>`,
    flags: { [MODULE_ID]: { narratorCard: true, pacedNarrative: true, playerText, suggestedMove, sessionId: 'sess-1' } },
  }));
  await table.settle();
  return msg.id;
}

const moveCards = () => table.cards(f => f.moveResolution);

describe('a forced move rolls the stat its narration fits (issue #321 U04)', () => {
  it('the pacing "Roll ⟨move⟩" button: the GM reads the stat for the forced move, the dialog shows it, the roll uses it', async () => {
    const id = await postPacedCard('face_danger', SNEAK);

    table.client('pl-1').click(id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();

    // One stat-only reading, on the canonical GM, told the move is fixed.
    const readings = table.claude.calls.filter(isInterpreter);
    expect(readings).toHaveLength(1);
    expect(readings[0].client).toBe('gm-1');
    expect(readings[0].userText).toContain('MOVE ALREADY CHOSEN: the player chose Face Danger');
    expect(readings[0].userText).toContain(SNEAK);

    expect(control.confirmed).toEqual([{ moveId: 'face_danger', statUsed: 'shadow' }]);
    const [card] = moveCards();
    expect(card.content).toContain('+shadow (4)');            // was "+edge (1)"
  }, 30_000);

  it('a way-out button: the canned exit is read for its stat too', async () => {
    scriptClaude(table).when(isInterpreter,
      JSON.stringify({ moveId: 'face_danger', statUsed: 'shadow', confidence: 'high', rationale: 'Slipping away.' }));
    const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: `<div class="sf-way-out"><button type="button" data-action="sf-way-out-move" data-move-id="face_danger">Slip away</button></div>`,
      flags: { [MODULE_ID]: { wayOutCard: true } },
    }));
    await table.settle();

    table.client('pl-1').click(msg.id, '[data-action="sf-way-out-move"]');
    await table.settle(); await table.drain();

    expect(control.confirmed).toEqual([{ moveId: 'face_danger', statUsed: 'shadow' }]);
    expect(moveCards()[0].content).toContain('+shadow (4)');
  }, 30_000);

  it('control: a forced move with one stat to roll makes no reading', async () => {
    const id = await postPacedCard('gather_information', 'I comb the logs for the courier\'s route.');

    table.client('pl-1').click(id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();

    expect(table.claude.calls.filter(isInterpreter)).toHaveLength(0);
    expect(control.confirmed).toEqual([{ moveId: 'gather_information', statUsed: 'wits' }]);
  }, 30_000);
});
