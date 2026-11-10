/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE — BATCH: ROUND-READING-FIELDS-WRITE-ONLY (twelfth audit, 2026-11-09)
 *
 * Issue #342 Z37 (ROUND-FIELDS-WRITE-ONLY) retired the round fields nothing
 * read and added tests/unit/batchRoundFields.test.js, which "requires a
 * production reader for every field a round stores". Its sweep covers the
 * round, an entry and the objects an entry holds — rolled, upgrade, offer,
 * readAs, setAside — but not the entry's `reading`, the largest object the
 * round stores (one per submission, a copy of the move's interpretation).
 *
 * Two of the reading's fields are written by its producer and read nowhere:
 *   - `combatPosition` (src/moves/movePipeline.js readingFromMove, line 522
 *     at 22bdbeb): the roller's position at Submit. Free-flow hands its read
 *     position to rollMove (src/index.js 1044); the round's rollEntry
 *     (src/batch/driver.js 975-980) passes none, so rollMove reads the
 *     position again at the roll (movePipeline.js 657-659) — the stored copy
 *     is never used.
 *   - `decision` (readAction 480 and 492, readingFromMove 512): the pacing
 *     classifier's decision, shown nowhere and decided on nowhere.
 * rules/reachability.md §1: "A producer with zero consumers is a bug … a
 * schema field" — delete it, wire it, or mark it.
 *
 * The readings come from the real producer (readAction, run by the canonical
 * GM's driver on a submission through the relay); the readers are searched in
 * the production files that touch the round, comments stripped, as
 * batchRoundFields.test.js does.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const control = vi.hoisted(() => ({ pace: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { stripComments } from '../../../scripts/deadscan.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
// batchRoundFields.test.js's list: every production file that touches the round.
const ROUND_FILES = [
  'src/batch/round.js', 'src/batch/driver.js', 'src/batch/relay.js', 'src/batch/roundView.js',
  'src/ui/roundWindow.js', 'src/ui/companionToolbar.js', 'src/narration/narrator.js',
  'src/moves/movePipeline.js', 'src/multiplayer/gmRelay.js', 'src/index.js',
];
const code = Object.fromEntries(ROUND_FILES.map(f => [f, stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));

/** Reads of `reading.field` / `….reading.field` (not the left side of an assignment). */
function readsOf(field) {
  const re = new RegExp(`(?:\\breading|\\.reading)\\??\\.${field}\\b(?!\\s*=[^=>])`, 'g');
  return ROUND_FILES.flatMap(f => [...code[f].matchAll(re)].map(m => `${f}: ${m[0]}`));
}

let table;
const round = () => table.world.getSetting('batchMode.round');
let readings = {};

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table);
  control.pace = (text) => (/look around/.test(text)
    ? { runMove: false, decision: 'NARRATIVE_WITH_SUGGESTION', suggestedMove: 'gather_information' }
    : { runMove: true, decision: 'MOVE', suggestedMove: null });
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  const relay = async (userId, kind, payload) => {
    const c = table.client(userId);
    const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
    await c.run(() => gmRelay.requestGmAction(kind, payload));
    await table.settle();
  };
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I look around the hangar.', submissionId: 'r1' });
  await table.drain();
  readings = { move: round().entries['pl-1'].reading, narrative: round().entries['pl-2'].reading };
}, 60_000);
afterAll(() => table?.teardown());
beforeEach(() => { silenceConsoleErrors(); });

describe('ROUND-READING-FIELDS-WRITE-ONLY — what a reading stores is read', () => {
  it('control: the real producer stored both readings, and the sweep finds the fields the window and the roll use', () => {
    expect(readings.move).toMatchObject({ kind: 'move', moveId: 'face_danger' });
    expect(readings.narrative).toMatchObject({ kind: 'narrative', suggestedMove: 'gather_information' });
    for (const f of ['kind', 'moveId', 'statUsed', 'abilities', 'targetChoices', 'interpretation', 'suggestedMove', 'blocked']) {
      expect(readsOf(f), f).not.toEqual([]);
    }
  });

  it('control: both write-only candidates are stored on the round by the producer', () => {
    expect(Object.keys(readings.move)).toEqual(expect.arrayContaining(['combatPosition', 'decision']));
    expect(Object.keys(readings.narrative)).toContain('decision');
  });

  it('every field a stored reading carries has a production reader', () => {
    const keys = [...new Set([...Object.keys(readings.move), ...Object.keys(readings.narrative)])];
    const unread = keys.filter(k => readsOf(k).length === 0);
    expect(unread, 'stored on every round entry\'s reading and read nowhere — retire it, or wire its reader').toEqual([]);
  });
});
