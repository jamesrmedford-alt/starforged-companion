/**
 * FC-03 · SIDECAR-APPLIED-FOR-UNPOSTED-NARRATION  (LLM-OUTPUT)
 *
 * Scenario: the narrator's reply to a move is its fact block and nothing
 * else — no prose. narrateResolution treats that as a failed narration: it
 * posts the "narration unavailable" fallback card (EMPTY_REPLY_REASON), which
 * carries no `narrationId` (rules/narrator-memory.md invariant 1: "a fallback
 * card carries none"). Then the table plays the X-Card.
 *
 * Correct: nothing was narrated, so nothing of that reply is canon — the
 * scene ledger holds no truth, state value or frame from it (and, with the
 * narrative skeleton, no plan decision or reveal).
 *
 * Today: applyNarratorSidecar applies the block before any caller looks at
 * the prose (only the consistency audit is gated on `prose?.trim()`), so the
 * reply's truths, state and scene frame are written as binding facts stamped
 * with a narration id that no card carries: every later narration is told
 * they are established, and the X-Card — which finds what to retract by the
 * narration ids of the cards it removes — can never take them out. Every
 * narrator path has the same order (paced, @scene, oracle follow-up, round,
 * vignettes, vow scene, clock vignette — whose forced `reveals` would also
 * reveal a hidden plan's truth with no narration posted).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, narrateMoveOn, moveResolution, playXCard, patSpeaks,
} from '../../helpers/skeletonTable.js';

const FACT_BLOCK = '```json\n' + JSON.stringify({
  newTruths:    [{ subject: 'the dockmaster', fact: 'Is dead, shot by the escort' }],
  stateChanges: [{ subject: 'cargo bay', attribute: 'door', value: 'welded shut' }],
  sceneFrame:   { location: 'the cargo bay', present: ['Kira'], situation: 'Kira stands over the dockmaster\'s body' },
}) + '\n```';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const liveTruths = () => (stored().sceneTruths ?? []).filter(t => !t.retracted).map(t => t.fact);
const isNarration = (call) => call.model === NARRATION_MODEL;

describe('FC-03 — a reply with no prose is no narration: its fact block is not recorded', () => {
  it('control: prose with the same fact block is recorded, and the X-Card on its card retracts it', async () => {
    await patSpeaks(table);
    table.script.when(isNarration, `The dockmaster folds over the rail and does not get up.\n${FACT_BLOCK}`);
    await narrateMoveOn(table, moveResolution());
    expect(table.cards(f => f.narratorCard === true && f.narrationId)).toHaveLength(1);
    expect(liveTruths()).toContain('Is dead, shot by the escort');
    expect(stored().sceneFrame?.location).toBe('the cargo bay');

    await playXCard(table);
    expect(liveTruths()).not.toContain('Is dead, shot by the escort');
    expect(stored().sceneFrame?.location ?? null).not.toBe('the cargo bay');
    expect(stored().sceneState?.bySubject?.['cargo bay'] ?? []).toEqual([]);
  }, 40_000);

  it('a reply that is only the fact block posts the fallback card and leaves the ledger as it was', async () => {
    await patSpeaks(table);
    table.script.when(isNarration, FACT_BLOCK);
    await narrateMoveOn(table, moveResolution());

    // It was handled as a narration that failed: the fallback card, no narration card.
    expect(table.cards(f => f.narrationFallback === true)).toHaveLength(1);
    expect(table.cards(f => f.narratorCard === true && f.narrationId)).toHaveLength(0);

    expect(liveTruths(), 'no truth from a narration nobody read').not.toContain('Is dead, shot by the escort');
    expect(stored().sceneState?.bySubject?.['cargo bay'] ?? []).toEqual([]);
    expect(stored().sceneFrame?.location).toBe('the corridor');
  }, 40_000);

  it('…and what it recorded cannot be removed by the X-Card (no card carries its narration id)', async () => {
    await patSpeaks(table);
    table.script.when(isNarration, FACT_BLOCK);
    await narrateMoveOn(table, moveResolution());
    await playXCard(table);

    expect(liveTruths(), 'after the X-Card').not.toContain('Is dead, shot by the escort');
  }, 40_000);
});
