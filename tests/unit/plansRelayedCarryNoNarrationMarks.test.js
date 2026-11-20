/**
 * STARFORGED COMPANION
 * tests/unit/plansRelayedCarryNoNarrationMarks.test.js
 *
 * Issue #364 PLAN-RELAY-CARRIES-PLAYED-MARK (found while fixing
 * PLAN-CLUE-TRUTH-NO-MARK): the canonical GM answers a player's Private
 * Channel with the decided plans in play, as records holding only what
 * UNREVEALED renders — "never their oracle rolls, re-roll, clock or
 * provenance" (issue #362 D1). Since PLAN-STEP-REWRITTEN-BEFORE-BURN a played
 * step carries the narration that played it (`playedBy`), and the answer sent
 * the steps whole: every connected client was told which narration played
 * which step of a hidden plan. The marks are the store's bookkeeping for the
 * undo; the answer now carries a step and a clue as UNREVEALED renders them —
 * id, text, played or shown.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

describe('issue #364 PLAN-RELAY-CARRIES-PLAYED-MARK — the plans a player\'s client is given', () => {
  it('carry each step and clue as UNREVEALED renders it, not the narration that played or showed it', async () => {
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    const plan = await onGm(table, () => secrets.createSkeleton({
      kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
      escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down', 'A Choir sigil on its hull'],
      sceneId: 'sc-1', sessionId: 's-1',
    }));
    table.replies = () => ({ prose: 'The escort turns.', sidecar: { newTruths: [], stateChanges: [],
      reveals: [{ id: plan.id, revealed: ['c1'], advanced: 'e1' }] } });
    await narrateMoveOn(table, moveResolution());
    const narrationId = table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
    const record = plansOf(table).find(p => p.id === plan.id);
    expect(record.escalation[0], 'the store keeps the marks').toMatchObject({ done: true, playedBy: narrationId });
    expect(record.clues[0]).toMatchObject({ revealed: true, revealedBy: narrationId });

    const { buildPrivateChannelStory } = await table.client('pl-1').import('../../src/narration/narrator.js');
    const sent = [];
    const socket = gmOf(table).run(() => game.socket);
    const emit = socket.emit.bind(socket);
    socket.emit = (channel, message) => { sent.push(message); return emit(channel, message); };
    let story;
    try {
      story = await table.client('pl-1').run(() => buildPrivateChannelStory(game.settings.get(MODULE_ID, 'campaignState'), 'What is the escort, really?'));
    } finally {
      socket.emit = emit;
    }
    const answer = sent.find(m => m?.kind === 'plansInPlay.answer');
    const sentPlan = answer?.plans?.find(p => p.id === plan.id);
    expect(sentPlan, 'the plan in play is sent').toBeTruthy();
    expect(sentPlan.escalation).toEqual([
      { id: 'e1', text: 'It asks again, closer', done: true },
      { id: 'e2', text: 'It seals the corridor', done: false },
    ]);
    expect(sentPlan.clues).toEqual([
      { id: 'c1', text: 'A pulse that counts down', revealed: true },
      { id: 'c2', text: 'A Choir sigil on its hull', revealed: false },
    ]);
    expect(JSON.stringify(answer), 'no narration is named anywhere in the answer').not.toContain(narrationId);
    // The player's narrator is still told what was played and shown.
    expect(story.scene).toContain('[e1] It asks again, closer (played)');
    expect(story.scene).toContain('[c1] A pulse that counts down (shown)');
  }, 60_000);
});
