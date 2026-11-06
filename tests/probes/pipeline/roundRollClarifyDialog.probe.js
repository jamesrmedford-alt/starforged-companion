/**
 * PIPE-2 ROUND-ROLL-CLARIFY-DIALOG — a Batch Mode round's roll opens the
 * "Who are you interacting with?" dialog on the canonical GM's screen and
 * holds the move lock (and the round) while it waits.
 *
 * rollMove (src/moves/movePipeline.js) is shared by free-flow and the round
 * driver. After the dice it resolves the narrator's relevance and, for a
 * hybrid move's hit with an implicit reference (Face Danger / Secure an
 * Advantage — "I talk him down"), awaits ClarificationDialog.prompt on the
 * client running it. In a round that client is the canonical GM, inside
 * rollRound, under the round's move-lock claim. decisions.md, Batch Mode:
 * "No confirm dialog opens on the GM's screen during a round" (the player
 * confirms the reading in their own window) and "The move lock is claimed for
 * the rolls and again for the narration … (an interactive wait never holds
 * it)". The free-flow pre-roll dialogs holding the lock is a separate,
 * decided case (decisions.md "Move-concurrency lock covers narration +
 * persistence, not post-roll prompts").
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [], prompts: [], gate: null }));

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
  interpretMove: vi.fn(async () => control.interpret()),
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
// A hybrid move's hit that refers to someone by a pronoun: the relevance
// resolver asks who (its Phase 2 — a Haiku call — answered "implied entity").
vi.mock('../../../src/context/relevanceResolver.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveRelevance: vi.fn(async () => ({
    resolvedClass: 'interaction', entityIds: [], entityTypes: [], matchedNames: [],
    needsClarification: true, referenceType: 'pronoun',
  })),
}));
// The dialog: record which client opened it, and hold it until the test answers.
vi.mock('../../../src/world/clarificationDialog.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    ClarificationDialog: class {
      static async prompt() {
        control.prompts.push({ client: globalThis.game?.user?.id ?? null });
        return control.gate ? control.gate.promise : { kind: 'none', entityId: null, entityType: null, entityName: null };
      }
    },
  };
});
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
import { scriptClaude, deferred } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const ROUND_REPLY = 'Kira talks the guard down.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];   // challenge 3, 4; action 6 (+edge 2): a strong hit
const FACE_DANGER = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
const MOVE = { runMove: true, decision: 'MOVE', suggestedMove: null };

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
// A held dialog is always answered, so a failed assertion cannot leave the
// GM's round driver waiting into the next test.
afterEach(async () => {
  control.gate?.resolve({ kind: 'none', entityId: null, entityType: null, entityName: null });
  control.gate = null;
  await table.settle(); await table.drain();
});

beforeEach(async () => {
  control.pace = () => ({ ...MOVE });
  control.interpret = () => ({ ...FACE_DANGER });
  control.dice = [];
  control.prompts = [];
  control.gate = null;
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
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function kiraActsAlone() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I talk him down before he raises the alarm.', submissionId: `sub-${++seq}` });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
}

describe('PIPE-2 — a round\'s roll never waits on a GM dialog under the move lock', () => {
  it('no "Who are you interacting with?" dialog opens on the GM\'s screen while the round rolls', async () => {
    control.dice = [STRONG];
    control.gate = deferred();
    await kiraActsAlone();
    await table.settle();

    // Sanity: the round is rolling, holding the move lock.
    expect(round()?.phase).toBe('rolling');
    expect(world().pendingMove).toBe(true);

    expect(control.prompts).toEqual([]);
  }, 30_000);

  it('…and the round is not left waiting on it: it narrates without a GM answering a dialog', async () => {
    control.dice = [STRONG];
    control.gate = deferred();           // the GM never answers
    await kiraActsAlone();
    await table.settle();

    expect(narrations()).toHaveLength(1);
  }, 30_000);

  it('control: answered, the round goes on — narrated once, the lock free, round 2 open', async () => {
    control.dice = [STRONG];
    await kiraActsAlone();
    await table.settle(); await table.drain();
    expect(narrations()).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('control: free-flow (the mode off) asks on the GM — the decided pre-narration step of a typed move', async () => {
    control.dice = [STRONG];
    await table.client('pl-1').chat('I talk him down before he raises the alarm.', { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
    expect(control.prompts).toEqual([{ client: 'gm-1' }]);
  }, 30_000);
});
