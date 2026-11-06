/**
 * SWP — ROUND-NAMES-FROZEN-AT-OPEN (eleventh audit, sweep).
 *
 * A Batch Mode round entry snapshots its PC's name when the round opens
 * (round.js newEntry: `actorName: pc.name`) and nothing refreshes it. The
 * round's narration then names each acting character by that snapshot —
 * roundNarrationEntries → buildRoundUserMessage's "THIS ROUND" blocks and the
 * PARTY roster's `actingNames` — while the CHARACTER blocks resolve the PC by
 * its id (getActiveCharacter(campaignState, e.actorId)) and so carry the
 * current name. And buildPartyContext keeps a party member only when its
 * CURRENT name is in that list of OLD names (`actingNames.includes(m.name)`,
 * src/narration/narrator.js) — identity by a mutable display name
 * (rules/reachability.md §6). A player who renames their PC while a round
 * collects (a new character's name settled in the first session) is dropped
 * from the PARTY roster; with two PCs acting the roster falls under two and
 * the whole PARTY block — the attribution rules a round relies on — is gone,
 * and the narrator is told "Kira" acts while her CHARACTER block says "Kira
 * Vale".
 *
 * Same mocked leaves as tests/unit/batchModeTable.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
  };
});
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => control.interpret(text)),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
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
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
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

describe('SWP — a round names its characters as they are when it is narrated', () => {
  it('control: no rename — the PARTY roster marks both acting PCs, and THIS ROUND names them', async () => {
    const call = await playRound();
    expect(call.system).toMatch(/## PARTY[\s\S]*Kira \(acting this round\)[\s\S]*Ren \(acting this round\)/);
    expect(call.userText).toMatch(/### 1\. Kira — Face Danger/);
  }, 30_000);

  it('Kira renamed to "Kira Vale" while the round collected: the PARTY roster still names her, as she is now', async () => {
    const call = await playRound({ renameKiraTo: 'Kira Vale' });
    // Sanity: her CHARACTER block (resolved by her actor id) carries the new name.
    expect(call.system).toContain('Kira Vale');
    // The round's own blocks name her as the sheet does (they say "Kira").
    expect.soft(call.userText).toMatch(/### 1\. Kira Vale — Face Danger/);
    // The roster: both acting PCs, by their current names. Today the PARTY
    // block is gone whole: "Kira Vale" is not in the round's ["Kira", "Ren"],
    // so only Ren is kept, and one member makes no roster.
    expect(call.system).toMatch(/## PARTY[\s\S]*Kira Vale \(acting this round\)[\s\S]*Ren \(acting this round\)/);
  }, 30_000);
});
