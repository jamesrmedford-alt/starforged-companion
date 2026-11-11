/**
 * Probe NARR — a Batch Mode round is narrated twice when the GM narrating it
 * drops off the server for a moment and a keyed co-GM takes the narration
 * over; the first GM's late finish then closes the NEXT round.
 *
 * narrateRound (src/narration/narrator.js) is called once by the round driver
 * (src/batch/driver.js narrateTheRound) under the round's narration claim.
 * The driver's recovery takes that claim over when its GM "went away before
 * the round card posted" (round.js claimNarration, `takeOver`). But the first
 * GM's page may still be alive — its connection to the Foundry server dropped
 * while its request to Anthropic was out — and narrateRound, once its reply
 * is in, posts the round's card (or its fallback) without checking that the
 * round's narration is still its caller's: the X-Card is the only thing it
 * re-checks after the await. The round then has two narrator cards with two
 * narration ids (both in the ring and the summary, both sidecars applied),
 * and the driver's `finishRound(getStoredRound() ?? round, "resolved")` runs
 * on the first GM for whatever round is stored by then.
 *
 * Driven on the multi-client harness: two keyed GMs and two players, Batch
 * Mode on. gm-1's narration call is held; gm-1 leaves (no further deliveries,
 * `userConnected(false)` on the others — tests/helpers/multiClient.js); gm-2
 * resumes and narrates the round; a player submits into round 2; gm-1 is back
 * (same page — no reload) and its held reply arrives.
 *
 *   npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narr/roundNarratedTwiceAfterTakeover.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, traceTable } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = (who) => `${who} tells the round.\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;

let table;
const round = () => table.world.getSetting('batchMode.round');
const roundCards = (roundId) => table.cards(f => f.narratorCard === true && f.roundId === roundId);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

let claude;
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  claude = scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? REPLY(call.client === 'gm-2' ? 'Gus' : 'Gina') : '{}') });
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function bothActAndConfirm() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
}

describe('a round whose narrating GM drops off the server while its narration is written', () => {
  it('control: with no drop the round is narrated once and the next round collects', async () => {
    const first = round();
    await bothActAndConfirm();
    await table.settle(); await table.drain();

    expect(roundCards(first.id)).toHaveLength(1);
    expect(round()).toMatchObject({ number: first.number + 1, phase: 'collecting' });
  }, 30_000);

  it('is narrated once when the first GM is back within seconds and both replies arrive (a short drop)', async () => {
    const errors = [];
    const realError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); };
    try {
      const trace = traceTable(table);
      const first = round();
      const heldGina = claude.hold(c => c.model === NARRATION_MODEL && c.client === 'gm-1');
      const heldGus  = claude.hold(c => c.model === NARRATION_MODEL && c.client === 'gm-2');
      await bothActAndConfirm();
      await heldGina.arrived;
      expect(round(), 'gm-1 is narrating round 1 (setup)').toMatchObject({ id: first.id, phase: 'narrating' });

      trace.mark("gm-1's connection drops");
      await table.leave('gm-1');
      await heldGus.arrived;                       // gm-2 took the narration over: its own call is out
      expect(roundCards(first.id), 'no card yet (setup)').toHaveLength(0);

      trace.mark('gm-1 is back two seconds later (the same page); both replies arrive');
      await table.join('gm-1');
      heldGina.release(REPLY('Gina'));
      await table.settle();
      heldGus.release(REPLY('Gus'));
      await table.settle();
      await table.drain(5_000).catch(() => {});
      await table.settle();

      expect(table.claude.calls.filter(c => c.model === NARRATION_MODEL).map(c => c.client), 'two narration calls were billed (setup)').toEqual(['gm-1', 'gm-2']);
      expect(
        roundCards(first.id).map(m => m.flags[MODULE_ID].narrationText.split('\n')[0]),
        'round 1 has two narrator cards — two tellings of one round, both in narrator memory',
      ).toHaveLength(1);
    } finally {
      console.error = realError;
      if (!table.client('gm-1').connected) await table.join('gm-1');
    }
  }, 60_000);

  it('is narrated once, and the next round keeps collecting, when the first GM\'s reply arrives after a co-GM took the narration over', async () => {
    const errors = [];
    const realError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); };
    try {
      const trace = traceTable(table);
      const first = round();
      const held = claude.hold(c => c.model === NARRATION_MODEL && c.client === 'gm-1');
      await bothActAndConfirm();
      await held.arrived;
      expect(round(), 'gm-1 is narrating round 1 (setup)').toMatchObject({ id: first.id, phase: 'narrating' });

      // gm-1's connection to the server drops; its page — and its request to Anthropic — live on.
      trace.mark("gm-1's connection drops");
      await table.leave('gm-1');
      await table.settle();
      for (let i = 0; i < 50 && round().id === first.id; i++) { await table.settle(); }
      expect(roundCards(first.id).length, 'gm-2 took the narration over and posted the round card (setup)').toBe(1);
      const second = round();
      expect(second, 'round 2 is collecting (setup)').toMatchObject({ number: first.number + 1, phase: 'collecting' });

      // The table plays on: Kira's player writes her action for round 2.
      await relay('pl-1', 'batch.submit', { roundId: second.id, text: 'I pull Ren up after me.', submissionId: 'k2' });
      expect(round().entries['pl-1']?.text, "Kira's round-2 action is in (setup)").toBe('I pull Ren up after me.');

      // gm-1 is back (the same page), and its narration's reply arrives.
      trace.mark('gm-1 is back; its reply arrives');
      await table.join('gm-1');
      held.release(REPLY('Gina'));
      await table.settle();
      await table.drain(5_000).catch(() => {});
      await table.settle();

      const now = round();
      expect(
        {
          round1NarratorCards: roundCards(first.id).length,
          storedRound: { id: now.id === second.id ? 'round 2' : now.id === first.id ? 'round 1' : 'another', phase: now.phase },
          kirasRound2Action: now.entries?.['pl-1']?.text ?? null,
        },
        'round 1 has two narrations and/or round 2 was closed under the players',
      ).toEqual({
        round1NarratorCards: 1,
        storedRound: { id: 'round 2', phase: 'collecting' },
        kirasRound2Action: 'I pull Ren up after me.',
      });
    } finally {
      console.error = realError;
      if (!table.client('gm-1').connected) await table.join('gm-1');
    }
  }, 60_000);
});
