/* global silenceConsoleErrors -- tests/setup.js and Node globals, as in tests/unit */
/**
 * STARFORGED COMPANION
 * tests/unit/batchEntryCharacterGone.test.js
 *
 * Issue #342 Z35 (ROUND-ENTRY-PC-GONE-FIRST-PC; the Batch Mode auditor's
 * probe). A round entry keeps the actor id its participant had when the
 * round opened. When that PC is deleted before the round resolves — after its
 * player confirmed — rollEntry rolled the entry with `speakerActorId:
 * entry.actorId`, and rollMove's rollerFor and persistResolution both fall
 * back to `getPlayerActors()[0]` for an id that no longer resolves: the entry
 * was rolled with ANOTHER player's PC's stats and its result landed on that
 * PC. Free-flow never does this (issue #326 D8; decisions.md "Multiplayer
 * attribution" — credit the roller). The round now refuses such an entry
 * (its card says why), and does not read one either.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // challenge 3 and 4, action 6: a strong hit (+1 momentum) whatever the stat.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const momentum = (id) => table.actors.get(id).system.momentum.value;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
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

async function kiraConfirms() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
}

describe('a round entry whose PC was deleted before the round resolved (issue #342 Z35)', () => {
  it('control: Kira\'s strong hit is Kira\'s; Ren\'s momentum is untouched', async () => {
    const ren = momentum('pc-ren');
    const kira = momentum('pc-kira');
    await kiraConfirms();
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await table.drain();
    expect(momentum('pc-kira')).toBe(kira + 1);
    expect(momentum('pc-ren')).toBe(ren);
  }, 30_000);

  it('Kira deleted after her confirm: nothing of her entry lands on Ren', async () => {
    const ren = momentum('pc-ren');
    await kiraConfirms();
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', actorId: 'pc-kira' });
    table.actors.delete('pc-kira');              // the GM deletes the character mid-round
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await table.drain();
    const card = table.cards(f => f.moveResolution && f.roundId)[0];
    // Ren never acted this round — his momentum is his own.
    expect(momentum('pc-ren'), `the round's result card was credited to ${card?.flags?.[MODULE_ID]?.actorId ?? card?.speaker?.actor ?? '?'}`).toBe(ren);
    // Not rolled at all, and its card says why.
    expect(table.cards(f => f.moveResolution && f.roundId)).toEqual([]);
    const refused = table.cards(f => f.roundRefusedCard).map(c => c.content ?? '');
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatch(/Kira — Face Danger: not rolled/);
    expect(refused[0]).toMatch(/no longer in the game/);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('a submission whose PC is gone is not read as another PC: the entry says why', async () => {
    table.actors.delete('pc-kira');
    const { interpretMove } = await import('../../src/moves/interpreter.js');
    const before = interpretMove.mock.calls.length;
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k2' });
    await table.drain();
    expect(interpretMove.mock.calls.length).toBe(before);
    expect(round().entries['pl-1']).toMatchObject({ status: 'submitted', error: 'character-gone' });
  }, 30_000);
});
