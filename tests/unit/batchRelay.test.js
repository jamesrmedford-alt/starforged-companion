/**
 * STARFORGED COMPANION
 * tests/unit/batchRelay.test.js
 *
 * Issue #340 — Batch Mode's GM relay handlers (src/batch/relay.js) on a
 * simulated table. Each acts on the REQUESTER's own entry (a payload naming
 * another user changes nothing of theirs); the GM controls refuse a player,
 * who is told; forged payloads — an ability not offered, an over-long text, a
 * stale round — change nothing the window couldn't; with no GM connected the
 * requester is warned and gets `no-gm`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => [{ key: 'ace', assetName: 'Ace', adds: 1, statReplacement: '' }]),
}));
vi.mock('../../src/moves/consequenceRiders.js', async (importOriginal) => ({
  ...(await importOriginal()),
  extractRiders: vi.fn(async () => []),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { ROUND_TEXT_MAX } from '../../src/batch/round.js';

let table;
const round = () => table.world.getSetting('batchMode.round');
const toldCards = (userId) => table.cards(f => f.batchRefusedNotice).filter(c => (c.whisper ?? []).includes(userId));

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
  scriptClaude(table);
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

describe('an entry is its requester\'s own', () => {
  it('a submit naming another user\'s id changes only the requester\'s entry', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through.', submissionId: 's1', userId: 'pl-2', actorId: 'pc-ren' });
    expect(round().entries['pl-1']).toMatchObject({ text: 'I slip through.', actorId: 'pc-kira' });
    expect(round().entries['pl-2']).toMatchObject({ status: 'waiting', text: null });
  });

  it('a confirm, withdraw or pass reaches no one else\'s entry', async () => {
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I keep watch.', submissionId: 'r1' });
    expect(round().entries['pl-2'].status).toBe('read');
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {}, userId: 'pl-2' });
    await relay('pl-1', 'batch.withdraw', { roundId: round().id, userId: 'pl-2' });
    expect(round().entries['pl-2'].status).toBe('read');
    expect(toldCards('pl-1').length).toBeGreaterThan(0);   // Pat's confirm of nothing of hers was refused, and said so
  });
});

describe('forged payloads change nothing the window couldn\'t', () => {
  it('an ability the reading did not offer is refused, and the requester told', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through.', submissionId: 's1' });
    expect(round().entries['pl-1'].reading.abilities.map(a => a.key)).toEqual(['ace']);
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 's1', choices: { abilityIds: ['not-mine'] } });
    expect(round().entries['pl-1'].status).toBe('read');
    expect(toldCards('pl-1').map(c => c.content).join()).toMatch(/That ability wasn't offered/);
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 's1', choices: { abilityIds: ['ace'] } });
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', choices: { abilityIds: ['ace'] } });
  });

  it('an over-long action and a stale round are refused, and said so', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'x'.repeat(ROUND_TEXT_MAX + 5), submissionId: 's1' });
    expect(round().entries['pl-1'].status).toBe('waiting');
    await relay('pl-1', 'batch.submit', { roundId: 'not-this-round', text: 'I act.', submissionId: 's2' });
    expect(round().entries['pl-1'].status).toBe('waiting');
    const said = toldCards('pl-1').map(c => c.content).join('\n');
    expect(said).toMatch(/1–2000 characters/);
    expect(said).toMatch(/That round has ended/);
  });
});

describe('the GM controls', () => {
  it('a player\'s Send now and Discard are refused, and they are told', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through.', submissionId: 's1' });
    await relay('pl-2', 'batch.sendNow', { roundId: round().id });
    await relay('pl-2', 'batch.discard', { roundId: round().id });
    expect(round().phase).toBe('collecting');
    expect(round().entries['pl-1'].status).toBe('read');
    const said = toldCards('pl-2').map(c => c.content).join('\n');
    expect(said).toMatch(/Only a GM can send the round now/);
    expect(said).toMatch(/Only a GM can discard the round/);
  });

  it('a GM\'s Discard closes the round — its authors told, the next round open', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through.', submissionId: 's1' });
    const first = round().id;
    await relay('gm-1', 'batch.discard', { roundId: first });
    expect(round()).toMatchObject({ phase: 'collecting', number: 2 });
    expect(round().id).not.toBe(first);
    expect(table.cards(f => f.batchRoundClosedNotice).map(c => c.whisper)).toEqual([['pl-1']]);
  });
});

describe('with no GM connected', () => {
  it('the requester is warned and gets no-gm; nothing is written', async () => {
    await table.leave('gm-1');
    const res = await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through.', submissionId: 's1' });
    expect(res).toEqual({ ok: false, reason: 'no-gm' });
    expect(table.client('pl-1').notifications.some(n => n.level === 'warn' && /no GM is connected/.test(n.message))).toBe(true);
    expect(round().entries['pl-1'].status).toBe('waiting');
    await table.join('gm-1');
  }, 30_000);
});
