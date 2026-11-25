/**
 * STARFORGED COMPANION
 * tests/unit/colourFades.test.js
 *
 * Overhaul 2, slice 3 (§5.3, §5.6, D6) — the narrator's own colour fades:
 *
 *   - by beats: it is in the block while one of the scene's latest
 *     COLOUR_BEATS (6) narrations wrote or restated it — its `said` list;
 *   - a restatement refreshes it (the dedup it met before refreshes `said`),
 *     and one the table's words bear out raises it to bind;
 *   - the X-Card takes its narration off what that narration restated;
 *   - with its scene: a scene's end files no colour (colourNotFiled.test.js);
 *   - what binds stands whatever the window.
 *
 * The scene's narrations are its stamped cards (record/cards.js
 * registerSceneStampHook), read on the table below.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { applySidecar, retractNarrations } from '../../src/factContinuity/ledgers.js';
import { COLOUR_BEATS, inColourWindow } from '../../src/factContinuity/provenance.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf, onGm } from '../helpers/skeletonTable.js';

const LAMPS = 'the dock lamps burn amber';
const state = () => ({ currentSessionId: 's1', currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } });
const say = (cs, narrationId, truths, basis = 'narrator') => applySidecar({ newTruths: truths, stateChanges: [] },
  { campaignState: cs, asserter: 'narrator', narrationId, basisOf: () => basis });

describe('overhaul 2 §5.3 — colour fades by beats', () => {
  it(`stands while one of the scene's latest ${COLOUR_BEATS} narrations said it`, () => {
    const cs = state();
    say(cs, 'n1', [{ subject: 'scene', fact: LAMPS }]);
    const window = (ids) => ({ colourWindow: new Set(ids) });
    expect(buildLedgerBlock(cs, window(['n1', 'n2'])).described).toContain(LAMPS);
    expect(buildLedgerBlock(cs, window(['n2', 'n3', 'n4', 'n5', 'n6', 'n7'])).described).not.toContain(LAMPS);
    // With no window (the scene's cards unstamped) it stands, as everything did.
    expect(buildLedgerBlock(cs, { colourWindow: null }).described).toContain(LAMPS);
  });

  it('a restatement refreshes it; one the table\'s words bear out raises it to bind', () => {
    const cs = state();
    say(cs, 'n1', [{ subject: 'scene', fact: LAMPS }]);
    say(cs, 'n7', [{ subject: 'scene', fact: LAMPS }]);
    expect(cs.sceneTruths).toHaveLength(1);
    expect(cs.sceneTruths[0].said).toEqual(['n7', 'n1']);
    expect(inColourWindow(cs.sceneTruths[0], new Set(['n7']))).toBe(true);
    say(cs, 'n8', [{ subject: 'scene', fact: LAMPS }], 'player');
    expect(cs.sceneTruths[0].basis).toBe('player');
    expect(buildLedgerBlock(cs, { colourWindow: new Set(['n99']) }).binds).toContain(`  scene — ${LAMPS} (the player)`);
    // Nothing lowers it.
    say(cs, 'n9', [{ subject: 'scene', fact: LAMPS }], 'narrator');
    expect(cs.sceneTruths[0].basis).toBe('player');
  });

  it('the X-Card takes its narration off what it restated; the writer\'s own stands', () => {
    const cs = state();
    say(cs, 'n1', [{ subject: 'scene', fact: LAMPS }]);
    say(cs, 'n7', [{ subject: 'scene', fact: LAMPS }]);
    retractNarrations(cs, ['n7']);
    expect(cs.sceneTruths[0]).toMatchObject({ retracted: false, said: ['n1'] });
    expect(inColourWindow(cs.sceneTruths[0], new Set(['n7']))).toBe(false);
  });

  it('what binds stands whatever the window', () => {
    const cs = state();
    say(cs, 'n1', [{ subject: 'Tamsin Vey', fact: 'holds the manifest' }], 'player');
    expect(buildLedgerBlock(cs, { colourWindow: new Set(['n2']) }).binds).toContain('Tamsin Vey — holds the manifest (the player)');
  });
});

describe('overhaul 2 §8 — every narrator card carries its scene; the window is read from them', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { restore = await resetSkeletonTable(table, {}, { sceneFrame: null }); });
  afterEach(() => restore?.());

  it('a narration\'s card is stamped with the scene it was told in', async () => {
    table.replies = () => ({ prose: 'The escort waits.', sidecar: { newTruths: [{ subject: 'scene', fact: LAMPS }], stateChanges: [] } });
    const { narratePacedInput } = await gmOf(table).import('../../src/narration/narrator.js');
    await onGm(table, () => narratePacedInput('I wait by the lamps.',
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    const card = gmOf(table).run(() => game.messages.contents.findLast(m => m.flags?.[MODULE_ID]?.narratorCard));
    expect(card.flags[MODULE_ID].sceneId).toBe('sc-1');
  }, 60_000);
});
