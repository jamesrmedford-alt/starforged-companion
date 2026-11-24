/**
 * STARFORGED COMPANION
 * tests/unit/expeditionFinishFollowsItsTrack.test.js
 *
 * Known-issues EXPEDITION-FINISH-COUNT-STALE — found by the long haul's
 * rehearsal (2026-11-24, long-haul-rehearsal-20261124-125939, a23–a24; in
 * every expedition rehearsal since). A hit on Undertake an Expedition posts
 * the Expedition card, its "🗺 Finish the Expedition (n/10)" drawn from the
 * track as it stood then and muted while a finish would probably miss
 * (EXPEDITION_FINISH_READY_BOXES). Explore a Waypoint's strong hit offers
 * "Mark expedition progress"; pressing it marked the track (8 → 16 ticks) and
 * posted no card, so the one Finish button on screen still read "(2/10)",
 * muted as early, while the track held 4/10 — and the finish rolled 4. The
 * canonical GM now redraws every Expedition card still to be pressed from its
 * track whenever the tracks change, whoever changed them, and at its load:
 * the one live Finish button carries the track's real count, in the card
 * itself, for every client and after a reload.
 *
 * On a booted GM / player table (tests/helpers/multiClient.js) with live
 * journals (liveDocuments.js — the tracks journal's update hook fires on every
 * client, as Foundry's does): the player's lines go through the GM's real
 * move pipeline, the player presses the choice card on their own client, and
 * the tracks are written by the real store (src/ui/progressTracks.js).
 */

/* global expectConsoleError -- tests/setup.js */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline: no pacing call, the confirm dialog accepted, the interpreter
// answering `control.interpretation`, and scripted dice inside the REAL
// resolveMove (`control.dice`, consumed in order).
const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({ ...control.interpretation, playerNarration: narration, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const r of control.dice) dice.mockReturnValueOnce(r);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { withLiveDocuments } from '../helpers/liveDocuments.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The beacon pulses somewhere ahead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// +wits: challenge 2 and 3, action 6 + wits 2 = 8 — a strong hit, no match.
const STRONG = [0.15, 0.25, 0.9];
const MARK_PROGRESS = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const FINISH = '[data-action="sf-finish-expedition"]';

const typed = (moveId, moveName, extra = {}) => ({
  moveId, moveName, statUsed: 'wits', adds: 0, rationale: 'test', mischiefApplied: false, ...extra,
});

let table;
const tracksJournal = () => table.journal.contents.find(j => Array.isArray(j.flags?.[MODULE_ID]?.tracks)) ?? null;
const tracks = () => tracksJournal()?.flags?.[MODULE_ID]?.tracks ?? [];
const expeditionCards = () => table.cards(f => f.expeditionProgressCard);
const content = (id) => table.world.message(id).content;

/** A player types a move; the canonical GM's pipeline runs it. */
async function typedMove(interpretation, dice, line) {
  control.interpretation = interpretation;
  control.dice = dice;
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-pat' } });
  await table.settle();
  await table.drain();
}

/** A player (or the GM) clicks a card's button; whatever it starts runs to the end. */
async function clickCard(userId, cardId, selector) {
  table.client(userId).click(cardId, selector);
  await table.settle();
  await table.drain();
}

/** Undertake an Expedition's strong hit: the dangerous track begun at one mark, and its card. */
async function undertake() {
  await typedMove(typed('undertake_an_expedition', 'Undertake an Expedition', { moveTarget: 'the source of the distress call', expeditionRank: 'dangerous' }),
    STRONG, 'I take her off the charted lane, along the call\'s bearing.');
  const track = tracks().at(-1);
  const card = expeditionCards().at(-1);
  expect(track).toMatchObject({ type: 'expedition', rank: 'dangerous', ticks: 8 });
  expect(card, 'the Undertake\'s Expedition card').toBeTruthy();
  return { track, card };
}

beforeAll(async () => {
  table = withLiveDocuments(await simulateTable({ users: [USERS.GM, USERS.P1] }));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  control.interpretation = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionStartedId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => REPLY });
});

describe('the Expedition card\'s Finish button follows its track (EXPEDITION-FINISH-COUNT-STALE)', () => {
  it('a waypoint\'s mark, pressed by the player: the one Finish button on the table reads 4/10, no longer muted', async () => {
    const { track, card } = await undertake();
    expect(content(card._id)).toContain('🗺 Finish the Expedition (2/10)</button>');
    expect(content(card._id)).toMatch(/class="sf-followup-btn sf-followup-btn--early" data-action="sf-finish-expedition"/);

    await typedMove(typed('explore_a_waypoint', 'Explore a Waypoint'), STRONG, 'I go over the place the call is coming from.');
    const choice = table.cards(f => f.sufferCard && !f.resolved && f.moveId === 'explore_a_waypoint')[0];
    expect(choice, 'the waypoint\'s choice card').toBeTruthy();
    await clickCard('pl-1', choice._id, MARK_PROGRESS);

    expect(tracks().find(t => t.id === track.id).ticks).toBe(16);
    expect(expeditionCards()).toHaveLength(1);                     // one live Finish button, the Undertake's
    expect(content(card._id)).toContain('🗺 Finish the Expedition (4/10)</button>');
    expect(content(card._id)).toMatch(/class="sf-followup-btn" data-action="sf-finish-expedition"/);
    expect(content(card._id)).toMatch(/title="Progress roll: your 4 progress against both challenge dice"/);
    expect(content(card._id)).not.toMatch(/a miss is likely/);
    // The player's own client shows it, and its button rolls the finish as theirs.
    const shown = table.client('pl-1').render(card._id).querySelector(FINISH);
    expect(shown.textContent).toBe('🗺 Finish the Expedition (4/10)');
    await clickCard('pl-1', card._id, FINISH);
    expect(table.world.message(card._id).flags[MODULE_ID].expeditionFinishAttempted).toBeTruthy();
    expect(table.cards(f => f.forcedMoveId === 'finish_an_expedition').map(m => m.flags[MODULE_ID].forcedMoveTargetId)).toEqual([track.id]);
  });

  it('every other writer of the track\'s progress is followed too — the GM\'s marks, and one taken back', async () => {
    const { track, card } = await undertake();
    const gm = table.client('gm-1');
    const store = await gm.import('../../src/ui/progressTracks.js');

    await gm.run(() => store.markProgressById(track.id, 2));
    await table.settle(); await table.drain();
    expect(content(card._id)).toContain('🗺 Finish the Expedition (6/10)</button>');
    expect(content(card._id)).not.toMatch(/sf-followup-btn--early/);

    await gm.run(() => store.adjustProgressById(track.id, -1));
    await table.settle(); await table.drain();
    expect(content(card._id)).toContain('🗺 Finish the Expedition (4/10)</button>');

    await gm.run(() => store.updateTrackFields(track.id, { ticks: 12 }));
    await table.settle(); await table.drain();
    expect(content(card._id)).toContain('🗺 Finish the Expedition (3/10)</button>');
    expect(content(card._id)).toMatch(/class="sf-followup-btn sf-followup-btn--early" data-action="sf-finish-expedition"/);
  });

  it('a card left stale — posted before the fix, or by a write the GM\'s page missed — is redrawn at the GM\'s load', async () => {
    const gm = table.client('gm-1');
    const store = await gm.import('../../src/ui/progressTracks.js');
    const track = await gm.run(async () => {
      const t = await store.addProgressTrack({ label: 'the source of the distress call', type: 'expedition', rank: 'dangerous' });
      await store.updateTrackFields(t.id, { ticks: 16 });
      return t;
    });
    await table.settle();
    // The card as the module drew it before this fix, at 2/10.
    const STALE = '<div class="sf-ptp-card"><strong>Expedition</strong><p>New expedition <strong>the source of the distress call</strong> (Dangerous) begun — progress marked (2/10 boxes). If the rank looks off, adjust it in the Progress Tracks panel.</p>'
      + '<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn sf-followup-btn--early" data-action="sf-finish-expedition" title="Progress roll: your 2 progress against both challenge dice — a miss is likely this early">🗺 Finish the Expedition (2/10)</button></div></div>';
    const card = await gm.run(() => ChatMessage.create({ content: STALE, flags: { [MODULE_ID]: {
      expeditionProgressCard: true, created: true, trackLabel: track.label, trackId: track.id, actorId: 'pc-pat',
    } } }));
    await table.settle();
    expect(content(card.id)).toContain('(2/10)');

    // The player's Private Lines re-sync meets the GM's page mid-reload — the
    // reload's own noise, nothing of the card's.
    expectConsoleError(/Private Lines: not written/);
    await table.reload('gm-1');
    await table.settle(); await table.drain();

    expect(content(card.id)).toContain('🗺 Finish the Expedition (4/10)</button>');
    expect(content(card.id)).not.toMatch(/a miss is likely/);
    // What the card says the mark did stays as it was: only the button follows the track.
    expect(content(card.id)).toContain('progress marked (2/10 boxes)');
  });

  it('control: a card whose track is over, or whose Finish was pressed, is left as it is', async () => {
    const { track, card } = await undertake();
    const gm = table.client('gm-1');
    const store = await gm.import('../../src/ui/progressTracks.js');
    await gm.run(() => store.updateTrackFields(track.id, { ticks: 24, completed: true }));
    await table.settle(); await table.drain();
    expect(content(card._id)).toContain('🗺 Finish the Expedition (2/10)</button>');

    const second = await undertake();
    await gm.run(() => gm.message(second.card._id).update({ [`flags.${MODULE_ID}.expeditionFinishAttempted`]: true }));
    await gm.run(() => store.markProgressById(second.track.id));
    await table.settle(); await table.drain();
    expect(content(second.card._id)).toContain('🗺 Finish the Expedition (2/10)</button>');
  });
});
