/**
 * STARFORGED COMPANION
 * tests/unit/moveRoutingNoMovePipeline.test.js
 *
 * Issue #354 P2-01 (alpha 23 playtest part 2) — a line that makes no move is
 * narrated, not rolled.
 *
 * In the playtest "Tell us the whole story" was classified MOVE; the
 * interpreter's own rationale said "this is a narrative choice… the module
 * should treat this as a narrative exchange", and the Confirm Move dialog
 * opened all the same, offering only Accept — Roll and Cancel — re-word. Now:
 *   - the interpreter's "no move" (or a low-confidence reading) is narrated,
 *     with the move the classifier named offered on the narration's card;
 *   - the confirm dialog has a third answer, "No move — narrate";
 *   - a cancelled reading's "Not rolled" notice offers "Narrate it — no
 *     move", which narrates the line as it stands.
 *
 * Production entry points: a player's typed line through the chat hook on a
 * simulated GM + player table — the real pacing router, classifier,
 * interpreter, move pipeline and paced narrator, Claude answered at the fetch
 * boundary. The confirm dialog (ApplicationV2) is answered by the test.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ confirm: () => true, confirmed: [] }));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async (interpretation, opts) => {
    control.confirmed.push({ moveId: interpretation?.moveId ?? null, forced: !!opts?.forced });
    return control.confirm(interpretation, opts);
  }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, isReaderCall, asLineReader } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const LINE      = 'Tell us the whole story';
const NARRATION = 'Archer lets out a breath and starts at the beginning.';
const isClassifier  = (call) => isReaderCall(call);
const isInterpreter = (call) => isReaderCall(call);

let table, claude, replies;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirm = () => true;
  control.confirmed = [];
  replies = {
    classifier:  { decision: 'MOVE', suggestedMove: 'compel', category: 'social', confidence: 0.8, reasoning: 'Presses Archer for the story.' },
    interpreter: { moveId: null, statUsed: null, rationale: 'A narrative exchange — nothing is attempted.', confidence: 'high' },
  };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null },
  } } });
  table.addActor({ id: 'pc-isaac', name: 'Isaac Sutton', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  claude = scriptClaude(table, {
    fallback: (call) => {
      // The two readers' scripts, answered by the one line reader (issue #384, slice 2).
      if (isReaderCall(call)) return asLineReader(replies)(call);
      if (/NARRATOR ROLE|SIDECAR/.test(call?.system ?? '')) return `${NARRATION}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
      return '{}';
    },
  });
  silenceConsoleErrors();
});

const say = async (text = LINE) => {
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-isaac', alias: 'Isaac Sutton' } });
  await table.settle(); await table.drain();
};
const pacedCards = () => table.cards(f => f.pacedNarrative);
const moveCards  = () => table.cards(f => f.moveResolution);
const notices    = () => table.cards(f => !!f.moveNotRolledNotice);
const calls      = (match) => table.claude.calls.filter(match);

describe('issue #354 P2-01 — the confirm dialog\'s "No move — narrate"', () => {
  beforeEach(() => {
    replies.interpreter = { moveId: 'compel', statUsed: 'heart', rationale: 'Asks for the story.', confidence: 'medium' };
  });

  it('the line is narrated as it stands: no roll, no move offered, no "Not rolled" notice', async () => {
    control.confirm = () => 'narrate';
    await say();

    expect(control.confirmed).toEqual([{ moveId: 'compel', forced: false }]);
    expect(moveCards()).toHaveLength(0);
    expect(notices(), 'it was not cancelled: nobody is told to re-word').toHaveLength(0);
    const [card] = pacedCards();
    expect(card.flags[MODULE_ID]).toMatchObject({ playerText: LINE, suggestedMove: null });
    expect(String(table.world.message(card._id).content)).not.toMatch(/sf-paced-roll/);
    expect(table.world.campaignState().pendingMove).toBe(false);
  }, 60_000);
});

describe('issue #354 P2-01 — a cancelled reading\'s notice offers the narration', () => {
  beforeEach(() => {
    replies.interpreter = { moveId: 'compel', statUsed: 'heart', rationale: 'Asks for the story.', confidence: 'medium' };
    control.confirm = () => false;                    // "Cancel — re-word"
  });

  it('the notice carries "Narrate it — no move", and pressing it narrates the line once', async () => {
    await say();
    const [notice] = notices();
    expect(notice.flags[MODULE_ID]).toMatchObject({ moveNotRolledNotice: 'cancelled', narrateOffered: true,
      restoreLine: LINE, lineActorId: 'pc-isaac' });
    const html = String(table.world.message(notice._id).content);
    expect(html).toMatch(/data-action="sf-narrate-no-move"/);
    expect(html).toMatch(/have it narrated as it stands/);
    expect(pacedCards()).toHaveLength(0);
    const classified = calls(isClassifier).length;

    // The line's author presses it.
    table.client('pl-1').click(notice._id, '[data-action="sf-narrate-no-move"]');
    await table.settle(); await table.drain();

    expect(table.world.message(notice._id).flags[MODULE_ID].narrated, 'the notice is claimed').toBe(true);
    const [card, ...more] = pacedCards();
    expect(more).toHaveLength(0);
    expect(card.flags[MODULE_ID]).toMatchObject({ playerText: LINE, suggestedMove: null, actorId: 'pc-isaac' });
    expect(moveCards()).toHaveLength(0);
    expect(calls(isClassifier), 'the line was not classified again').toHaveLength(classified);
    expect(calls(isInterpreter), 'nor read as a move again').toHaveLength(1);

    // A second press does nothing.
    table.client('gm-1').click(notice._id, '[data-action="sf-narrate-no-move"]');
    await table.settle(); await table.drain();
    expect(pacedCards()).toHaveLength(1);
  }, 60_000);

  it('a card button\'s cancelled move offers none — there is no line to narrate', async () => {
    table.client('pl-1').chat('I press Archer for the truth.', {
      speaker: { actor: 'pc-isaac', alias: 'Isaac Sutton' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'compel' } },
    });
    await table.settle(); await table.drain();
    const [notice] = notices();
    expect(notice.flags[MODULE_ID].narrateOffered).toBeUndefined();
    expect(String(table.world.message(notice._id).content)).not.toMatch(/sf-narrate-no-move/);
  }, 60_000);
});

describe('issue #354 P2-01 — a roll that was asked for is a roll', () => {
  it('`!roll` before the line: the interpreter is told a roll was asked for, and the dialog opens', async () => {
    control.confirm = () => false;
    await table.client('gm-1').chat('!roll');
    await table.settle(); await table.drain();
    await say();
    const [read] = calls(isInterpreter);
    expect(read.userText).toMatch(/A ROLL WAS ASKED FOR/);
    expect(control.confirmed, 'the no-move answer fell back to a move, and the dialog opened').toHaveLength(1);
    expect(pacedCards()).toHaveLength(0);
  }, 60_000);
});
