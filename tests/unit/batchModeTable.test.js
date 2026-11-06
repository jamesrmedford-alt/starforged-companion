/**
 * STARFORGED COMPANION
 * tests/unit/batchModeTable.test.js
 *
 * Batch Mode (issue #340) on a simulated table (tests/helpers/multiClient.js):
 * a GM and three players, each with a PC, Claude answered at the fetch
 * boundary. Each player acts through their Round window's relays
 * (src/batch/relay.js); the canonical GM's driver (src/batch/driver.js) reads,
 * resolves, rolls, records and narrates. The window itself renders the view
 * model (src/batch/roundView.js), pinned in batchRoundView.test.js.
 *
 * Mocked leaves, as elsewhere (multiplayerConcurrency.test.js): the pacing
 * decision and the interpreter answer by the line, the ability scan finds
 * nothing, the dice are scripted inside the REAL resolveMove, and the capture
 * pass's detection is a no-op (its 2 s timer would land in a later test).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({
  pace: null, interpret: null, dice: [], calls: [],
}));
vi.mock('../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    decidePacing: vi.fn(async ({ playerText }) => {
      control.calls.push({ fn: 'decidePacing', client: globalThis.game?.user?.id ?? null, text: playerText });
      return control.pace(playerText);
    }),
  };
});
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    interpretMove: vi.fn(async (text) => {
      control.calls.push({ fn: 'interpretMove', client: globalThis.game?.user?.id ?? null, text });
      return control.interpret(text);
    }),
  };
});
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
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const P3 = Object.freeze({ id: 'pl-3', name: 'Rook', isGM: false });
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const ROUND_REPLY = 'Kira slips through the vent as Ren keeps the corridor covered.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];

const FACE_DANGER = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
const MOVE = { runMove: true, decision: 'MOVE', suggestedMove: null };
const NARRATIVE = { runMove: false, decision: 'NARRATIVE', suggestedMove: null, suggestedTargetId: null };

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2, P3] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.pace = (text) => (/^I (keep|watch|wait)/.test(text) ? { ...NARRATIVE } : { ...MOVE });
  control.interpret = () => ({ ...FACE_DANGER });
  control.dice = [];
  control.calls = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    narratorSessionSummary: false,
    combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: { 'pl-3': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function batchModeOn() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
}

async function submit(userId, text) {
  const submissionId = `sub-${userId}-${++seq}`;
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId });
  return submissionId;
}

async function confirm(userId, choices = {}) {
  const r = round();
  return relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices });
}

const pass = (userId) => relay(userId, 'batch.pass', { roundId: round().id });

describe('turning Batch Mode on', () => {
  it('opens one round, with an entry for each participant — a second write opens nothing more', async () => {
    await batchModeOn();
    const r = round();
    expect(r).toMatchObject({ number: 1, phase: 'collecting', sessionId: 'sess-1' });
    expect(Object.keys(r.entries).sort()).toEqual(['pl-1', 'pl-2', 'pl-3']);
    expect(r.entries['pl-1']).toMatchObject({ actorId: 'pc-kira', status: 'waiting' });

    // A GM with no assigned PC is no participant — never another player's PC.
    expect(r.entries['gm-1']).toBeUndefined();

    const id = r.id;
    await table.client('gm-1').setSetting('batchMode.enabled', true);   // unchanged: no update
    await table.settle();
    expect(round().id).toBe(id);
  }, 30_000);
});

describe('a round', () => {
  it('reads each action once on the GM, resolves on the last confirm, narrates once, credits the roller, and opens round 2', async () => {
    await batchModeOn();
    control.dice = [STRONG];
    const momentumBefore = { kira: table.actors.get('pc-kira').system.momentum.value, ren: table.actors.get('pc-ren').system.momentum.value };

    await submit('pl-1', 'I slip through the vent before the drones turn.');
    await submit('pl-2', 'I keep the corridor covered.');
    await pass('pl-3');

    // Each reading ran once, on the canonical GM.
    const readings = control.calls.filter(c => c.fn === 'decidePacing');
    expect(readings.map(c => c.client)).toEqual(['gm-1', 'gm-1']);
    expect(control.calls.filter(c => c.fn === 'interpretMove').map(c => c.client)).toEqual(['gm-1']);
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', reading: { kind: 'move', moveId: 'face_danger' } });
    expect(round().entries['pl-2']).toMatchObject({ status: 'read', reading: { kind: 'narrative' } });

    await confirm('pl-1');
    expect(round().phase).toBe('collecting');            // Ren has not confirmed
    await confirm('pl-2');
    await table.drain();

    // One narration, both actions, Ash named nowhere.
    expect(narrations()).toHaveLength(1);
    const call = narrations()[0];
    expect(call.userText).toContain('Kira');
    expect(call.userText).toContain('Ren');
    expect(call.userText).toContain('I slip through the vent');
    expect(`${call.system}\n${call.userText}`).not.toMatch(/\bAsh\b/);
    expect(roundCards()).toHaveLength(1);
    expect(roundCards()[0].flags[MODULE_ID].roundEntries.map(e => e.playerName)).toEqual(['Kira', 'Ren']);

    // Kira's strong hit is Kira's.
    expect(table.actors.get('pc-kira').system.momentum.value).toBe(momentumBefore.kira + 1);
    expect(table.actors.get('pc-ren').system.momentum.value).toBe(momentumBefore.ren);

    expect(world().pendingMove).toBe(false);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('Send now resolves without the player who hasn\'t acted, who is named nowhere — and a player\'s Send now is refused', async () => {
    await batchModeOn();
    control.dice = [STRONG];
    await submit('pl-1', 'I slip through the vent before the drones turn.');
    await confirm('pl-1');
    expect(round().phase).toBe('collecting');

    const refused = await relay('pl-2', 'batch.sendNow', { roundId: round().id });
    expect(round().phase).toBe('collecting');
    expect(table.cards(f => f.batchRefusedNotice).map(c => c.whisper)).toEqual([['pl-2']]);
    expect(refused).toMatchObject({ ok: true, relayed: true });

    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(narrations()).toHaveLength(1);
    const call = narrations()[0];
    expect(`${call.system}\n${call.userText}`).not.toMatch(/\bRen\b|\bAsh\b/);
    expect(roundCards()[0].flags[MODULE_ID].roundEntries.map(e => e.playerName)).toEqual(['Kira']);
    expect(table.cards().filter(m => /Ren|Ash/.test(m.content ?? '') && m.flags?.[MODULE_ID]?.batchNotice)).toEqual([]);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);
});

describe('typed chat while Batch Mode is on', () => {
  it('is table talk: no reading, no narration; its author is told once a round and keeps it as a draft', async () => {
    await batchModeOn();
    await table.client('pl-1').chat('I think we should check the vents first.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.client('pl-1').chat('Seriously, the vents.', { speaker: { actor: 'pc-kira' } });
    await table.settle();

    expect(control.calls).toEqual([]);
    expect(narrations()).toEqual([]);
    const told = table.client('pl-1').notifications.filter(n => /table talk/.test(n.message));
    expect(told).toHaveLength(1);
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe('I think we should check the vents first.');
    // Nobody else is told.
    expect(table.client('pl-2').notifications.filter(n => /table talk/.test(n.message))).toEqual([]);
  }, 30_000);
});
