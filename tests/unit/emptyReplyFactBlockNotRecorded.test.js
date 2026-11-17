/**
 * STARFORGED COMPANION
 * tests/unit/emptyReplyFactBlockNotRecorded.test.js
 *
 * Issue #362 AC39 (UNPOSTED-REPLY-FACT-BLOCK-APPLIED): a narrator reply that
 * is its fact block and nothing else is no narration. narrateResolution posts
 * the "narration unavailable" card for it — which carries no `narrationId`
 * (rules/narrator-memory.md invariant 1) — so nothing of the block may be
 * recorded: no truth, state value or scene frame, no plan write. It used to
 * be applied before any caller looked at the prose, stamped with an id no card
 * carries: every later narration was told it was established, and no X-Card
 * could take it back.
 *
 * From the fourteenth audit's probes (fc/sidecarAppliedForUnpostedNarration,
 * nara/emptyReplyAppliesFactBlock), on a simulated table.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrateMoveOn, moveResolution, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';

const FACT_BLOCK = '```json\n' + JSON.stringify({
  newTruths:    [{ subject: 'the dockmaster', fact: 'Is dead, shot by the escort' }],
  stateChanges: [{ subject: 'cargo bay', attribute: 'door', value: 'welded shut' }],
  sceneFrame:   { location: 'the cargo bay', present: ['Kira'], situation: 'Kira stands over the dockmaster\'s body' },
  newThreats:   [{ name: 'the escort' }],
}) + '\n```';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const liveTruths = () => (stored().sceneTruths ?? []).filter(t => !t.retracted);
const isNarration = (call) => call.model === NARRATION_MODEL;

describe('issue #362 AC39 — a reply with no prose records nothing of its fact block', () => {
  it('control: prose with the block is recorded under its card\'s narrationId, and the X-Card on the card retracts it', async () => {
    await patSpeaks(table);
    table.script.when(isNarration, `The dockmaster folds over the rail and does not get up.\n${FACT_BLOCK}`);
    await narrateMoveOn(table, moveResolution());

    const card = table.cards(f => f.narratorCard === true && f.narrationId && !f.narrationFallback).at(-1);
    const narrationId = card?.flags?.[MODULE_ID]?.narrationId;
    expect(narrationId).toBeTruthy();
    const truth = liveTruths().find(t => t.fact === 'Is dead, shot by the escort');
    expect(truth?.narrationId).toBe(narrationId);
    expect(stored().sceneFrame?.location).toBe('the cargo bay');
    expect(plansOf(table).map(p => p.subject.name)).toEqual(['the escort']);

    await playXCard(table);
    expect(liveTruths().map(t => t.fact)).not.toContain('Is dead, shot by the escort');
    expect(stored().sceneFrame?.location ?? null).not.toBe('the cargo bay');
    expect(stored().sceneState?.bySubject?.['cargo bay'] ?? []).toEqual([]);
  }, 40_000);

  it('a reply that is only the block posts the fallback card and leaves the scene and the plans as they were', async () => {
    await patSpeaks(table);
    table.script.when(isNarration, FACT_BLOCK);
    await narrateMoveOn(table, moveResolution());

    // Handled as a narration that failed: the fallback card, no narration card.
    const fallback = table.cards(f => f.narrationFallback === true);
    expect(fallback).toHaveLength(1);
    expect(fallback[0].content).toContain("the narrator's reply had no text");
    expect(table.cards(f => f.narratorCard === true && f.narrationId && !f.narrationFallback)).toEqual([]);

    expect(liveTruths().map(t => t.fact), 'no truth from a narration nobody read').not.toContain('Is dead, shot by the escort');
    expect(stored().sceneState?.bySubject?.['cargo bay'] ?? []).toEqual([]);
    expect(stored().sceneFrame?.location, 'the scene frame is the one the table knows').toBe('the corridor');
    expect(plansOf(table), 'no plan for an enemy no narration introduced').toEqual([]);
  }, 40_000);

  it('…so the X-Card has nothing of it to miss', async () => {
    await patSpeaks(table);
    table.script.when(isNarration, FACT_BLOCK);
    await narrateMoveOn(table, moveResolution());
    await playXCard(table);
    expect(liveTruths().map(t => t.fact), 'after the X-Card').not.toContain('Is dead, shot by the escort');
  }, 40_000);
});
