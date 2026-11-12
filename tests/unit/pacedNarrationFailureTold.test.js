/**
 * Issue #347 AB21 (PACED-NARRATION-FAILURE-UNTOLD) — a paced (free-flow,
 * no-roll) narration whose Claude call fails tells the table.
 *
 * A typed line the pacing classifier reads as NARRATIVE is narrated by
 * narratePacedInput (src/narration/narrator.js) on the canonical GM. Every
 * other narrator entry point that cannot narrate says so in chat: a move posts
 * its "narration unavailable" fallback card (narrateResolution →
 * postFallbackCard), `@scene` its fallback card (interrogateScene →
 * postSceneFallbackCard), and since issue #345 AA29 a paced line under the
 * X-Card its "not narrated" notice. When the paced narration's own call
 * failed — Anthropic overloaded (529), a server error, a timeout after 120 s,
 * a rate limit on the retry too — narratePacedInput's catch only
 * console.errored on the GM's client and returned null: the player's line sat
 * in chat with no card after it and no notification on any screen. It now
 * posts a "not narrated" notice, as the X-Card's does; so does a reply with
 * no prose.
 *
 * Driven end to end through a player's chat line on a three-client table
 * (keyed GM, two players), the classifier and the narrator answered by
 * scripted Claude replies (tests/helpers/faults.js).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, claudeFault } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const LINE = 'I lean on the bar and listen to the dockhands argue.';
const NARRATIVE = JSON.stringify({ decision: 'NARRATIVE', suggestedMove: null, category: 'social', confidence: 0.9, reasoning: 'listening, no risk' });
const PROSE = 'The dockhands bicker over a crate of stolen coolant.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const isClassifier = (call) => /pacing pre-classifier/.test(call.system ?? '');
const isNarration  = (call) => call.model === NARRATION_MODEL && !isClassifier(call);

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 } });
});

/** Everything the table was shown after the line: cards posted after it, and every client's notifications. */
function toldAfter(line) {
  const messages = table.world.messages();
  const at = messages.findIndex(m => m.content === line);
  const cards = messages.slice(at + 1).map(m => String(m.content ?? ''));
  const notes = ['gm-1', 'pl-1', 'pl-2'].flatMap(id => table.client(id).notifications.map(n => `${id}: ${n.message}`));
  return { cards, notes };
}

describe('a narrative line whose narration call fails', () => {
  it('control: the same line is narrated when the call succeeds', async () => {
    scriptClaude(table, { fallback: (call) => (isClassifier(call) ? NARRATIVE : isNarration(call) ? PROSE : '{}') });

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    expect(table.claude.calls.filter(isNarration)).toHaveLength(1);
    expect(table.cards(f => f.narratorCard === true && f.pacedNarrative === true)).toHaveLength(1);
  });

  it('Anthropic overloaded (529): the table is told the line was not narrated', async () => {
    const errors = [];
    const realError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); };
    try {
      scriptClaude(table, { fallback: (call) => (isClassifier(call) ? NARRATIVE : '{}') })
        .when(isNarration, claudeFault.overloaded());

      await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
      await table.settle(); await table.drain();
    } finally {
      console.error = realError;
    }

    // Setup: the line was classified NARRATIVE and its one narration call failed on the GM.
    expect(table.claude.calls.filter(isClassifier), 'the line was classified (setup)').toHaveLength(1);
    expect(table.claude.calls.filter(isNarration), 'one narration call was made (setup)').toHaveLength(1);
    expect(errors.some(e => /narratePacedInput failed/.test(e)), 'the failure reached narratePacedInput\'s catch (setup)').toBe(true);
    expect(table.cards(f => f.narratorCard === true && !f.narrationFallback), 'nothing was narrated (setup)').toHaveLength(0);
    expect(table.world.campaignState().pendingMove ?? false, 'no move lock is involved (setup)').toBe(false);

    // Something after the line says it was not narrated — a card, as a move's
    // fallback, @scene's fallback and AA29's paused notice are.
    const { cards } = toldAfter(LINE);
    expect(cards, 'one notice after the line').toHaveLength(1);
    expect(cards[0]).toMatch(/That line was not narrated/);
    expect(cards[0]).toMatch(/Narration unavailable/);
    expect(notice()?.flags?.[MODULE_ID]?.narratorCard, 'the notice is not fiction: no narrator card').toBeUndefined();
    expect(notice()?.whisper ?? [], 'the table sees it').toEqual([]);
  });

  it('a server error, retried once after a rate limit: one notice, after the retry', async () => {
    scriptClaude(table, { fallback: (call) => (isClassifier(call) ? NARRATIVE : '{}') })
      .when(isNarration, claudeFault.rateLimited())
      .when(isNarration, claudeFault.serverError());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await silenced(async () => {
        await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
        await table.settle();
        expect(toldAfter(LINE).cards, 'nothing yet — the retry waits 5 s').toHaveLength(0);
        await vi.advanceTimersByTimeAsync(5_000);
        await table.drain();
      });
    } finally {
      vi.useRealTimers();
    }
    expect(table.claude.calls.filter(isNarration), 'the rate limit was retried once').toHaveLength(2);
    expect(toldAfter(LINE).cards).toHaveLength(1);
    expect(toldAfter(LINE).cards[0]).toMatch(/That line was not narrated/);
  });

  it('a reply with no prose — only the fact block — is told too', async () => {
    scriptClaude(table, { fallback: (call) => (isClassifier(call) ? NARRATIVE : isNarration(call) ? '```json\n{"newTruths":[],"stateChanges":[]}\n```' : '{}') });
    await silenced(async () => {
      await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
      await table.settle(); await table.drain();
    });
    expect(table.cards(f => f.narratorCard === true)).toHaveLength(0);
    expect(toldAfter(LINE).cards).toHaveLength(1);
    expect(toldAfter(LINE).cards[0]).toMatch(/That line was not narrated/);
  });
});

/** The notice after the line, as the world holds it. */
function notice() {
  const messages = table.world.messages();
  const at = messages.findIndex(m => m.content === LINE);
  return messages[at + 1] ?? null;
}

/** Run fn with console.error / console.warn quietened (the failures log on purpose). */
async function silenced(fn) {
  const real = { error: console.error, warn: console.warn };
  console.error = () => {};
  console.warn = () => {};
  try { return await fn(); } finally { console.error = real.error; console.warn = real.warn; }
}
