/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundNamesByActorId.test.js
 *
 * Issue #342 Z36 (ROUND-NAMES-FROZEN-AT-OPEN; the sweep auditor's probe). A
 * Batch Mode round entry copies its PC's name when the round opens. The
 * round's narration named each acting character by that copy —
 * roundNarrationEntries → THIS ROUND, and the PARTY roster's acting list —
 * while the CHARACTER blocks resolve the PC by id and carry the current name;
 * and buildPartyContext kept a party member only when its CURRENT name was in
 * that list of OLD names — identity by a mutable display name
 * (rules/reachability.md §6). A player who renamed their PC while a round
 * collected fell out of the roster, and with two acting PCs the whole PARTY
 * block — the round's attribution rules — was gone. The round now names its
 * characters by actor id at narration time, and the roster is filtered by id.
 *
 * Same mocked leaves as tests/unit/batchModeTable.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
  };
});
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => control.interpret(text)),
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
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const ROUND_REPLY = 'Kira slips through the vent as Ren keeps the corridor covered.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];
const FACE_DANGER = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
const MOVE = { runMove: true, decision: 'MOVE', suggestedMove: null };
const NARRATIVE = { runMove: false, decision: 'NARRATIVE', suggestedMove: null, suggestedTargetId: null };

let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
let seq = 0;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.pace = (text) => (/^I (keep|watch|wait)/.test(text) ? { ...NARRATIVE } : { ...MOVE });
  control.interpret = () => ({ ...FACE_DANGER });
  control.dice = [STRONG];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
const submit = (userId, text) => relay(userId, 'batch.submit', { roundId: round().id, text, submissionId: `sub-${userId}-${++seq}` });
const confirm = (userId) => relay(userId, 'batch.confirm', { roundId: round().id, submissionId: round().entries[userId].submissionId, choices: {} });

async function playRound({ renameKiraTo = null } = {}) {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  expect(round().entries['pl-1'].actorName).toBe('Kira');
  if (renameKiraTo) {
    // Kira's player settles her name on the sheet while the round collects.
    await table.client('pl-1').run(() => globalThis.game.actors.get('pc-kira').update({ name: renameKiraTo }));
    await table.settle();
  }
  await submit('pl-1', 'I slip through the vent before the drones turn.');
  await submit('pl-2', 'I keep the corridor covered.');
  await confirm('pl-1');
  await confirm('pl-2');
  await table.drain();
  expect(narrations()).toHaveLength(1);
  return narrations()[0];
}

describe('a round names its characters as they are when it is narrated (issue #342 Z36)', () => {
  it('control: no rename — the PARTY roster marks both acting PCs, and THIS ROUND names them', async () => {
    const call = await playRound();
    expect(call.system).toMatch(/## PARTY[\s\S]*Kira \(acting this round\)[\s\S]*Ren \(acting this round\)/);
    expect(call.userText).toMatch(/### 1\. Kira — Face Danger/);
  }, 30_000);

  it('Kira renamed to "Kira Vale" while the round collected: the PARTY roster still names her, as she is now', async () => {
    const call = await playRound({ renameKiraTo: 'Kira Vale' });
    // Sanity: her CHARACTER block (resolved by her actor id) carries the new name.
    expect(call.system).toContain('Kira Vale');
    // The round's own blocks name her as the sheet does.
    expect(call.userText).toMatch(/### 1\. Kira Vale — Face Danger/);
    expect(call.userText).not.toMatch(/### 1\. Kira — /);
    // The roster: both acting PCs, by their current names.
    expect(call.system).toMatch(/## PARTY[\s\S]*Kira Vale \(acting this round\)[\s\S]*Ren \(acting this round\)/);
  }, 30_000);
});
