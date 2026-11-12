/**
 * Issue #345 AA29 PACED-LINE-UNDER-XCARD-SILENT (the twelfth audit's R2F-2).
 *
 * While the X-Card is in play every narrator entry point stands down
 * (decisions.md "X-Card: anyone plays it, a GM resumes it"), and each one that
 * stands down says so: a move posts its result card plus a short "narration
 * paused" notice, `@scene` a "Scene paused — X-Card is active." card, the
 * Private Channel refuses and says why. A typed line the pacing classifier
 * read as narrative did neither — narratePacedInput's X-Card check returned
 * null: no card, no notice, and the line was never narrated after the resume.
 * Now it posts the paused notice (not a narrator card — never in the ring,
 * the summary or the chronicle).
 *
 * The line is still classified first, by design: classifying a typed line is
 * how a move is found, and a move typed during the pause still resolves and
 * posts its result with the paused notice (both refuters — the probe's
 * "no classifier call" soft assertion asked for more than the design and is
 * replaced by a check that the call is made).
 *
 * Driven end to end through a player's chat line on a three-client table
 * (keyed GM, two players); the classifier and narrator answered by scripted
 * Claude replies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const LINE = 'I lean on the bar and listen to the dockhands argue.';
const NARRATIVE = JSON.stringify({ decision: 'NARRATIVE', suggestedMove: null, category: 'social', confidence: 0.9, reasoning: 'listening, no risk' });

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

async function resetWith({ xCardActive }) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
      xCardActive, xCardPlays: xCardActive ? 1 : 0,
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 } });
  scriptClaude(table, { fallback: (call) => {
    if (/pacing pre-classifier/.test(call.system ?? '')) return NARRATIVE;
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) {
      return 'The dockhands bicker over a crate of stolen coolant.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    }
    return '{}';
  } });
}

const classifierCalls = () => table.claude.calls.filter(c => /pacing pre-classifier/.test(c.system ?? ''));
/** What the table was shown after the line: a card posted after it, or a notification on the author's screen. */
function toldAfter(line) {
  const messages = table.world.messages();
  const at = messages.findIndex(m => m.content === line);
  const cards = messages.slice(at + 1).map(m => m.content ?? '');
  const notes = table.client('pl-1').notifications.map(n => n.message);
  return { cards, notes };
}

describe('issue #345 AA29 — a narrative line typed while the X-Card is in play', () => {
  beforeEach(() => resetWith({ xCardActive: true }));

  it('the author is told the narration is paused, as a move or an @scene is', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    const { cards, notes } = toldAfter(LINE);
    // Nothing is narrated during the pause (by design) …
    expect(table.cards(f => f.narratorCard === true), 'no narration during the pause (setup)').toHaveLength(0);
    // … the line is classified, as every typed line is (a move typed now still resolves) …
    expect(classifierCalls(), 'the classifier reads the line').toHaveLength(1);
    // … and something says why: a paused notice on the chat, or a notification.
    expect([...cards, ...notes].some(t => /paused|X-Card/i.test(t)), `told: ${JSON.stringify({ cards, notes })}`).toBe(true);
  }, 60_000);

  it('the notice is one paused card, outside narrator memory, telling the table how to go on', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    const paused = table.cards(f => f.narrationPaused === true);
    expect(paused).toHaveLength(1);
    const [card] = paused;
    const flags = card.flags['starforged-companion'];
    expect(flags.narratorCard ?? false).toBe(false);
    expect(flags.narrationText ?? null).toBeNull();
    expect(flags.sessionId).toBe('sess-1');
    expect(card.content).toMatch(/Narration paused — the X-Card is active/);
    expect(card.content).toMatch(/say it again once a GM resumes/);
    expect(card.content).not.toMatch(/dockhands/);   // the line is not echoed
  }, 60_000);

  it('control: an @scene asked during the same pause gets its "Scene paused" card', async () => {
    await table.client('pl-1').chat('@scene What are the dockhands arguing about?');
    await table.settle(); await table.drain();

    expect(table.world.messages().some(m => /Scene paused — X-Card is active/.test(m.content ?? ''))).toBe(true);
  }, 60_000);
});

describe('issue #345 AA29 control — the same line with no X-Card', () => {
  beforeEach(() => resetWith({ xCardActive: false }));

  it('is classified and narrated', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    expect(classifierCalls()).toHaveLength(1);
    expect(table.cards(f => f.narratorCard === true && f.pacedNarrative === true)).toHaveLength(1);
  }, 60_000);
});
