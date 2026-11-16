/**
 * NARA-03 · UNPOSTED-REPLY-FACT-BLOCK-APPLIED
 *
 * Scenario: a move's narration comes back with no prose — only its fenced
 * fact block (the reply shape failureReason.js EMPTY_REPLY_REASON names:
 * "only a sidecar, or nothing"). narrateResolution posts the fallback card
 * "Narration unavailable — the narrator's reply had no text".
 *
 * Correct: nothing of a narration that was never posted enters narrator
 * memory — the rule the X-Card's discard follows (narrator.js watchXCard:
 * "the reply's side-data must not enter the scene ledger"). The scene's
 * truths, state and frame stay as they were, and no hidden plan is revealed.
 *
 * Today: applyNarratorSidecar runs BEFORE the empty-prose check
 * (narrateResolution: `const narration = applyNarratorSidecar(raw, …); if
 * (!narration?.trim()) { await postFallbackCard(…); return null; }`), so the
 * unseen reply's truths are recorded as binding, its scene frame replaces the
 * scene's, under a narrationId no card carries — the fallback card has none,
 * so no X-Card can ever take them back.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { skeletonTable, withSidecar, move, MODULE_ID } from './_skeletonTable.js';

let h;

beforeAll(async () => { h = await skeletonTable(); }, 30_000);
afterAll(() => h?.teardown());
beforeEach(async () => { await h.reset(); });
afterEach(() => h.restore());

const SIDECAR = {
  newTruths:    [{ subject: 'Vance', fact: 'Vance is dead on the deck plates' }],
  stateChanges: [{ subject: 'Vance', attribute: 'condition', value: 'dead' }],
  sceneFrame:   { location: 'the morgue', present: ['Kira'], situation: 'Kira stands over the body' },
};

const stored = () => h.table.world.campaignState();
const truths = () => (stored().sceneTruths ?? []).filter(t => !t.retracted).map(t => t.fact);

describe('NARA-03 — the fact block of a reply that was never posted does not enter the scene ledger', () => {
  it('control: a reply with prose posts its card and records its fact block under the card\'s narrationId', async () => {
    h.reply = () => withSidecar('Vance does not get up.', SIDECAR);
    await h.narrateMove(move());

    const card = h.table.cards(f => f.narratorCard === true && !f.narrationFallback).at(-1);
    expect(card?.flags?.[MODULE_ID]?.narrationId).toBeTruthy();
    expect(truths()).toContain('Vance is dead on the deck plates');
    expect(stored().sceneTruths.find(t => t.fact === 'Vance is dead on the deck plates').narrationId)
      .toBe(card.flags[MODULE_ID].narrationId);
    expect(stored().sceneFrame.location).toBe('the morgue');
  }, 40_000);

  it('a reply that is only the fact block posts the fallback card and leaves the scene as it was', async () => {
    h.reply = () => withSidecar('', SIDECAR).trim();
    await h.narrateMove(move());

    // The table was told the narration failed, and no narration card posted.
    const fallback = h.table.cards(f => f.narrationFallback === true).at(-1);
    expect(fallback, 'the "narration unavailable" card').toBeTruthy();
    expect(fallback.content).toContain("the narrator's reply had no text");
    expect(h.table.cards(f => f.narratorCard === true && !f.narrationFallback)).toEqual([]);

    // Nothing the unseen reply asserted is in the ledger.
    expect(truths(), 'no truth from a narration nobody read').not.toContain('Vance is dead on the deck plates');
    expect(stored().sceneFrame.location, 'the scene frame is the one the table knows').toBe('the corridor');
  }, 40_000);
});
