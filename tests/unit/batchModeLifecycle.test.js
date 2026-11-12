/**
 * STARFORGED COMPANION
 * tests/unit/batchModeLifecycle.test.js
 *
 * Issue #340 — Batch Mode on a table with two GMs and two players
 * (tests/helpers/multiClient.js): one reading per submission and one
 * narration however many GMs are connected; a keyless canonical GM keeps the
 * submissions until a keyed one can read them; the session gate (no round
 * before a session, End a Session closes a collecting round and keeps the
 * authors' drafts, Begin a Session opens round 1); and the mode switched off
 * mid-round (the GM's send now / discard / cancel).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ calls: [], dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async ({ playerText }) => {
    control.calls.push({ fn: 'decidePacing', client: globalThis.game?.user?.id ?? null, text: playerText });
    return /^I (keep|watch)/.test(playerText)
      ? { runMove: false, decision: 'NARRATIVE', suggestedMove: null, suggestedTargetId: null }
      : { runMove: true, decision: 'MOVE', suggestedMove: null };
  }),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? [0.25, 0.35, 0.9]) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { ROUND_NOTICES } from '../../src/batch/roundView.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
let seq = 0;

const SESSION = { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] };

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

async function fresh({ campaignState = SESSION, keyed = ['gm-1'] } = {}) {
  control.calls = [];
  control.dice = [];
  await table.reset({ world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, campaignState } } });
  for (const id of keyed) await table.setClaudeKey(id, `sk-ant-${id}`);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
const on = async () => { await table.client('gm-1').setSetting('batchMode.enabled', true); await table.settle(); };
async function submit(userId, text) {
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId: `sub-${userId}-${++seq}` });
}
async function confirm(userId) {
  const r = round();
  await relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices: {} });
}

/** The Round window's view on a client, as its window would render it. */
async function windowView(userId) {
  const c = table.client(userId);
  const mod = await c.import('../../src/ui/roundWindow.js');
  const app = await c.run(() => mod.RoundWindowApp.open());
  return (await c.run(() => app._prepareContext({}))).view;
}

describe('two GMs', () => {
  beforeEach(() => fresh());

  it('one reading per submission, on the canonical GM; one narration; one round card', async () => {
    await on();
    await submit('pl-1', 'I slip through the vent.');
    await submit('pl-2', 'I keep the corridor covered.');
    expect(control.calls.map(c => c.client)).toEqual(['gm-1', 'gm-1']);
    await confirm('pl-1');
    await confirm('pl-2');
    await table.drain();
    expect(narrations().map(c => c.client)).toEqual(['gm-1']);
    expect(roundCards()).toHaveLength(1);
    expect(round().number).toBe(2);
    // The second GM's window has the controls too.
    const gm2 = await windowView('gm-2');
    expect(gm2.gm).toBeTruthy();
  }, 30_000);
});

describe('a keyless canonical GM', () => {
  beforeEach(() => fresh({ keyed: [] }));

  it('says the round can\'t be read and keeps the submission — read once a keyed GM is canonical', async () => {
    await on();
    await submit('pl-1', 'I slip through the vent.');
    expect(round().entries['pl-1']).toMatchObject({ status: 'submitted', text: 'I slip through the vent.' });
    expect(control.calls).toEqual([]);
    expect((await windowView('pl-1')).banners.map(b => b.text)).toContain(ROUND_NOTICES.noKeyedGm);

    // Send now can't use what no one could read: refused, and said so.
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    expect(round().phase).toBe('collecting');

    await table.setClaudeKey('gm-2', 'sk-ant-gus');
    await table.settle();
    await table.drain();
    expect(control.calls.map(c => c.client)).toEqual(['gm-2']);
    expect(round().entries['pl-1'].status).toBe('read');
  }, 30_000);
});

describe('the session gate', () => {
  it('with no session, no round opens and the windows say why; Begin a Session opens round 1', async () => {
    await fresh({ campaignState: { ...SESSION, sessionActive: false } });
    await on();
    expect(round()).toBeUndefined();
    const view = await windowView('pl-1');
    expect(view.mode).toBe('no-session');
    expect(view.banners.map(b => b.text)).toContain(ROUND_NOTICES.noSession);

    await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: true, currentSessionId: 'sess-2', sessionNumber: 2 });
    await table.settle();
    await table.drain();
    expect(round()).toMatchObject({ number: 1, phase: 'collecting', sessionId: 'sess-2' });
  }, 30_000);

  it('End a Session mid-collect closes the round, tells the authors and restores their drafts', async () => {
    await fresh();
    await on();
    await submit('pl-1', 'I slip through the vent.');
    await table.client('pl-1').setSetting('batchMode.draft', '');

    await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false });
    await table.settle();
    await table.drain();
    expect(round()).toMatchObject({ phase: 'closed', closeReason: 'session-ended' });
    expect(table.cards(f => f.batchRoundClosedNotice).map(c => c.whisper)).toEqual([['pl-1']]);
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe('I slip through the vent.');
    expect(narrations()).toEqual([]);
    expect(table.cards(f => f.moveResolution)).toEqual([]);
  }, 30_000);
});

describe('turning Batch Mode off mid-round', () => {
  beforeEach(() => fresh());

  async function toggleOff(choice) {
    const gm = table.client('gm-1');
    gm.answerDialogs(d => d.choose(choice));
    const mod = await gm.import('../../src/ui/roundWindow.js');
    await gm.run(() => mod.toggleBatchMode());
    await table.settle();
    await table.drain();
  }

  it('cancel leaves it all as it was', async () => {
    await on();
    await submit('pl-1', 'I slip through the vent.');
    await toggleOff('cancel');
    expect(table.world.getSetting('batchMode.enabled')).toBe(true);
    expect(round()).toMatchObject({ phase: 'collecting' });
  }, 30_000);

  it('discard closes the round, keeps the author\'s draft, turns the mode off — and typed chat narrates again', async () => {
    await on();
    await submit('pl-1', 'I slip through the vent.');
    await toggleOff('discard');
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
    expect(round()).toMatchObject({ phase: 'closed', closeReason: 'mode-off' });
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe('I slip through the vent.');

    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.drain();
    expect(table.cards(f => f.moveResolution && !f.roundId)).toHaveLength(1);
  }, 30_000);

  it('send now resolves the round, then turns the mode off — no round 2', async () => {
    await on();
    await submit('pl-1', 'I slip through the vent.');
    await confirm('pl-1');
    await toggleOff('send');
    expect(roundCards()).toHaveLength(1);
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
    expect(round()).toMatchObject({ number: 1, phase: 'closed', closeReason: 'resolved' });
  }, 30_000);
});
