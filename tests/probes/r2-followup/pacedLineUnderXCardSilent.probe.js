/**
 * PROBE — R2F-2 PACED-LINE-UNDER-XCARD-SILENT (twelfth audit, round 2 — follow-up
 * of the narration report's "Not probed: paced line under active X-Card
 * spends the classifier and posts nothing (UX)")
 *
 * While the X-Card is in play every narrator entry point stands down
 * (decisions.md "X-Card: anyone plays it, a GM resumes it"), and each one
 * that stands down says so to the table:
 *   - a move: its result card plus a short "narration paused" notice
 *     (narrator.js:710-713 postNarrationPausedCard; decisions.md:3173-3175);
 *   - `@scene`: a "Scene paused — X-Card is active." card (narrator.js:2456-2457);
 *   - the Private Channel: refused with no Claude call, "the window is told
 *     why" (private-channel/narrate.js; tests/unit/privateChannelXCard.test.js,
 *     the maintainer's 2026-10-31 choice).
 * A plain typed line the pacing classifier reads as narrative does neither:
 *   src/index.js:936-950 — the chat pipeline has no X-Card gate before
 *     routePacedInput, so decidePacing → classifyInput makes its Claude call
 *     (pacing/classifier.js:367) and records the decision in the density
 *     window and the telemetry journal (pacing/router.js:214-230);
 *   src/pacing/router.js:307 → narratePacedInput, whose X-Card check
 *     (narrator.js:3136-3139) returns null — no card, no notice, no
 *     notification; `if (!pacingResult.runMove) return;` (index.js:952).
 * So during the pause a player's line just sits in chat: nothing tells them
 * the narrator is holding (the move typed beside it gets its paused notice),
 * and the table's Claude key is billed for a classification of a line nothing
 * will narrate.
 *
 * Driven end to end through a player's chat line on a three-client table
 * (keyed GM, two players); the classifier and narrator answered by scripted
 * Claude replies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
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

describe('R2F-2 — a narrative line typed while the X-Card is in play', () => {
  beforeEach(() => resetWith({ xCardActive: true }));

  it('the author is told the narration is paused, as a move or an @scene is', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    const { cards, notes } = toldAfter(LINE);
    // Nothing is narrated during the pause (by design) …
    expect(table.cards(f => f.narratorCard === true), 'no narration during the pause (setup)').toHaveLength(0);
    // … but something says why: a paused notice on the chat, or a notification.
    expect.soft(classifierCalls().length, 'Claude calls spent classifying a line nothing will narrate').toBe(0);
    expect([...cards, ...notes].some(t => /paused|X-Card/i.test(t)), `told: ${JSON.stringify({ cards, notes })}`).toBe(true);
  }, 60_000);

  it('control: an @scene asked during the same pause gets its "Scene paused" card', async () => {
    await table.client('pl-1').chat('@scene What are the dockhands arguing about?');
    await table.settle(); await table.drain();

    expect(table.world.messages().some(m => /Scene paused — X-Card is active/.test(m.content ?? ''))).toBe(true);
  }, 60_000);
});

describe('R2F-2 control — the same line with no X-Card', () => {
  beforeEach(() => resetWith({ xCardActive: false }));

  it('is classified and narrated', async () => {
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    expect(classifierCalls()).toHaveLength(1);
    expect(table.cards(f => f.narratorCard === true && f.pacedNarrative === true)).toHaveLength(1);
  }, 60_000);
});
