/**
 * STARFORGED COMPANION
 * tests/unit/plansPlayedToward.test.js
 *
 * Issue #402, change 4 — plans are played toward (D4). Six plans were made in
 * round 10 and one was revealed, by the fulfilment: nothing moved play toward
 * the plan the oath decided. Its Reach a Milestone (a72) was told "the
 * headway as the scene has shown it", and the plan's four clues stayed in the
 * Secrets journal; the vow was won by "Talia Tolari", a name drawn from the
 * name oracle that the table never saw.
 *
 * Now each Reach a Milestone on a vow with a plan carries a TELL line with the
 * plan's next clue not yet shown, marked shown with the narration; a who-vow's
 * culprit the story has not met enters it by name on a milestone; a Fulfill
 * Your Vow that misses plays the plan's next escalation step; and a who-vow's
 * plan that names no one is asked for once more at the oath — the drawn name
 * is gone (skeletons.js vowPlanOwed, narrator.js vowPlanOwedFor and
 * whoPlanNamingAsk).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vowPlanOwed, normaliseSkeleton } from '../../src/world/skeletons.js';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';
import { floorViolations } from '../../src/moves/contracts/checks.js';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, narrationCallsOf, playXCard } from '../helpers/skeletonTable.js';

const VOW = 'Find who is raiding the Cinder Expanse lanes';
const RUN = fileURLToPath(new URL('../../test/ci/playwright/explorations/long-haul-live-20261127-202557/replay.json', import.meta.url));
// Round 10's oath (a3): the plan its fact block decided for the vow.
const A3 = (() => {
  const exchanges = JSON.parse(readFileSync(RUN, 'utf8')).recording.exchanges;
  const reply = exchanges.find(e => e.step === 'a3' && e.kind === 'callNarratorAPI>call');
  const text = typeof reply.response === 'object' ? reply.response.content[0].text : reply.response;
  return extractSidecar(text).sidecar.plans[0];
})();
const PLAN = normaliseSkeleton({
  id: 'sk-vow-r10', kind: 'vow', status: 'active', subject: { type: 'vow', id: 'vid-kira', name: VOW },
  truth: A3.truth, wants: A3.wants, knows: A3.knows, escalation: A3.escalation, clues: A3.clues, resolutions: A3.resolutions,
});

describe('what a vow\'s plan owes a beat (skeletons.js vowPlanOwed)', () => {
  it('reads round 10\'s oath (setup): four clues, three escalation steps', () => {
    expect(PLAN.clues.map(c => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(PLAN.escalation.map(e => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('a72\'s milestone: the plan\'s first clue not yet shown, marked shown by the beat', () => {
    expect(vowPlanOwed(PLAN, { moveId: 'reach_a_milestone' })).toEqual({
      lines: [{ kind: 'clue', text: 'A stamped factory seal matching the one on the old manifest turns up on salvaged raider cargo.' }],
      reveals: [{ id: 'sk-vow-r10', revealed: ['c1'] }],
    });
    const shown = { ...PLAN, clues: PLAN.clues.map(c => (c.id === 'c1' ? { ...c, revealed: true } : c)) };
    expect(vowPlanOwed(shown, { moveId: 'reach_a_milestone' }).reveals).toEqual([{ id: 'sk-vow-r10', revealed: ['c2'] }]);
    const allShown = { ...PLAN, clues: PLAN.clues.map(c => ({ ...c, revealed: true })) };
    expect(vowPlanOwed(allShown, { moveId: 'reach_a_milestone' })).toEqual({ lines: [], reveals: [] });
  });

  it('a culprit the story has not met enters by name on the milestone — not once the truth is out', () => {
    expect(vowPlanOwed(PLAN, { moveId: 'reach_a_milestone', stranger: 'Talia Tolari' }).lines)
      .toEqual([expect.objectContaining({ kind: 'clue' }), { kind: 'culprit', text: 'Talia Tolari' }]);
    expect(vowPlanOwed({ ...PLAN, truthRevealed: true }, { moveId: 'reach_a_milestone', stranger: 'Talia Tolari' }).lines.map(l => l.kind))
      .toEqual(['clue']);
  });

  it('a missed fulfilment plays the next escalation step; a hit and any other move owe nothing', () => {
    expect(vowPlanOwed(PLAN, { moveId: 'fulfill_your_vow', outcome: 'miss' })).toEqual({
      lines: [{ kind: 'escalation', text: 'The raiders strike a convoy near Hollow Spire and leave a copy of the forged manifest behind.' }],
      reveals: [{ id: 'sk-vow-r10', advanced: 'e1' }],
    });
    for (const beat of [{ moveId: 'fulfill_your_vow', outcome: 'strong_hit' }, { moveId: 'fulfill_your_vow', outcome: 'weak_hit' },
      { moveId: 'gather_information', outcome: 'strong_hit' }, { moveId: 'face_danger', outcome: 'miss' }]) {
      expect(vowPlanOwed(PLAN, beat), JSON.stringify(beat)).toEqual({ lines: [], reveals: [] });
    }
  });

  it('nothing from a plan undecided, closed, withheld by the X-Card, or no vow\'s', () => {
    for (const plan of [{ ...PLAN, truth: '' }, { ...PLAN, status: 'resolved' }, { ...PLAN, truthWithheldBy: 'nar-x' }, { ...PLAN, kind: 'threat' }, null]) {
      expect(vowPlanOwed(plan, { moveId: 'reach_a_milestone', stranger: 'Talia Tolari' })).toEqual({ lines: [], reveals: [] });
    }
  });
});

describe('the lines a narration must tell, and their floors', () => {
  const milestone = { moveId: 'reach_a_milestone', moveName: 'Reach a Milestone', outcome: null, moveTarget: VOW };

  it('a milestone\'s block: the headway, then the clue and the culprit, under TELL', () => {
    const lines = obligationsFor({ mode: 'move', resolution: { ...milestone,
      planOwed: [{ kind: 'clue', text: PLAN.clues[0].text }, { kind: 'culprit', text: 'Talia Tolari' }] } });
    const told = lines.filter(o => o.list === 'TELL').map(o => o.kind);
    expect(told).toEqual(['milestone', 'clue', 'culprit']);
    expect(lines.find(o => o.kind === 'clue').text).toBe('THE HEADWAY TURNS SOMETHING UP. Show this in the beat — seen, found, heard or let '
      + 'slip — in the fiction, never explained: "A stamped factory seal matching the one on the old manifest turns up on salvaged raider cargo."');
    expect(lines.find(o => o.kind === 'culprit').text)
      .toBe('Talia Tolari enters the story in this beat, by name — seen, heard or spoken of — with nothing said yet of what they have done.');
  });

  it('a missed fulfilment\'s block: the recommit stays the player\'s, and the step is told', () => {
    const lines = obligationsFor({ mode: 'move', resolution: { moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', outcome: 'miss',
      moveTarget: VOW, planOwed: [{ kind: 'escalation', text: PLAN.escalation[0].text }] } });
    expect(lines.map(o => o.kind)).toEqual(expect.arrayContaining(['recommit', 'escalation']));
    expect(lines.find(o => o.kind === 'escalation').text).toContain('"The raiders strike a convoy near Hollow Spire and leave a copy of the forged manifest behind."');
  });

  it('a beat that shows none of it is logged, never asked again', () => {
    const lines = obligationsFor({ mode: 'move', resolution: { ...milestone,
      planOwed: [{ kind: 'clue', text: PLAN.clues[0].text }, { kind: 'culprit', text: 'Talia Tolari' }] } });
    expect(floorViolations('You trace the convoy routes on the board until the pattern holds.', lines))
      .toEqual({ reask: [], logged: [{ tag: 'clue', quote: '' }, { tag: 'culprit', quote: '' }] });
    expect(floorViolations('In the raider hold, a factory seal is stamped on a crate. Talia Tolari\'s name is on the docket.', lines))
      .toEqual({ reask: [], logged: [] });
  });
});

describe('on the table: the milestone shows the clue; a missed fulfilment plays the step; the oath asks for a name', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    restore = await resetSkeletonTable(table);
    table.actors.get('pc-kira').items.contents.push({
      id: 'vow-kira', type: 'progress', name: VOW, flags: { [MODULE_ID]: { vowId: 'vid-kira' } },
      system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
    });
  });
  afterEach(() => restore?.());

  /** Round 10's plan, filed about Kira's vow by its id. */
  async function filePlan(over = {}) {
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    return onGm(table, () => secrets.createSkeleton({
      kind: 'vow', subject: { type: 'vow', id: 'vid-kira', name: VOW }, truth: PLAN.truth,
      escalation: A3.escalation, clues: A3.clues, resolutions: A3.resolutions, sceneId: 'sc-old', sessionId: 's-0', ...over,
    }));
  }
  const planNow = (id) => plansOf(table).find(p => p.id === id);
  async function narrate(resolution) {
    const { narrateResolution } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narrateResolution({ _id: `res-${Math.random().toString(36).slice(2, 8)}`, oracleSeeds: null,
      loremasterContext: `[MOVE: ${resolution.moveName}]`, playerNarration: '', ...resolution },
    foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira', moveTarget: VOW }));
  }
  const milestone = () => narrate({ moveId: 'reach_a_milestone', moveName: 'Reach a Milestone', outcome: null, outcomeLabel: null });
  const narrationIdOf = () => table.cards(f => f.narratorCard && f.narrationId).at(-1)?.flags?.[MODULE_ID]?.narrationId ?? null;

  it('a72: the milestone\'s request tells the first clue; the clue is shown by that narration, and the next milestone tells the next', async () => {
    const filed = await filePlan();
    await milestone();
    const asked = narrationCallsOf(table).at(-1).userText;
    expect(asked).toContain('- [clue] THE HEADWAY TURNS SOMETHING UP.');
    expect(asked).toContain(`"${A3.clues[0]}"`);
    expect(planNow(filed.id).clues[0]).toMatchObject({ id: 'c1', revealed: true, revealedBy: narrationIdOf() });
    expect(planNow(filed.id).clues.slice(1).every(c => !c.revealed)).toBe(true);
    await milestone();
    expect(narrationCallsOf(table).at(-1).userText).toContain(`"${A3.clues[1]}"`);
    expect(planNow(filed.id).clues[1]).toMatchObject({ id: 'c2', revealed: true });
  }, 60_000);

  it('a milestone pressed from a card names no vow: beside an open background vow, the one vow with a plan is the one it serves', async () => {
    // The vow scenario's rehearsal (and round 10's a72): Mira's background vow is open too, and the card's milestone names none.
    const background = { id: 'vow-bg', type: 'progress', name: 'Find the lost colony ship Verity\'s Hope', flags: { [MODULE_ID]: { vowId: 'vid-bg' } },
      system: { subtype: 'vow', rank: 'epic', current: 0, completed: false } };
    table.actors.get('pc-kira').items.contents.push(background);
    const filed = await filePlan();
    const { narrateResolution } = await gmOf(table).import('../../src/narration/narrator.js');
    const pressed = () => onGm(table, () => narrateResolution({ _id: `res-${Math.random().toString(36).slice(2, 8)}`, moveId: 'reach_a_milestone',
      moveName: 'Reach a Milestone', outcome: null, outcomeLabel: null, playerNarration: '', loremasterContext: '[MOVE: Reach a Milestone]', oracleSeeds: null },
    foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    await pressed();
    expect(narrationCallsOf(table).at(-1).userText).toContain(`"${A3.clues[0]}"`);
    expect(planNow(filed.id).clues[0].revealed).toBe(true);
    // Both vows planned, and none named: which one the headway serves is the picker's, after — no clue is told.
    await filePlan({ subject: { type: 'vow', id: 'vid-bg', name: background.name } });
    await pressed();
    expect(narrationCallsOf(table).at(-1).userText).not.toContain('[clue]');
  }, 60_000);

  it('the X-Card on the milestone\'s narration takes its clue back', async () => {
    const filed = await filePlan();
    await milestone();
    expect(planNow(filed.id).clues[0].revealed).toBe(true);
    await playXCard(table);
    expect(planNow(filed.id).clues[0].revealed).toBe(false);
  }, 60_000);

  it('a stranger culprit is named in the milestone\'s request; a plan whose truth names no stranger asks no one in', async () => {
    const filed = await filePlan({ truth: `${PLAN.truth} The one behind it is Talia Tolari.` });
    await milestone();
    expect(narrationCallsOf(table).at(-1).userText)
      .toContain('- [culprit] Talia Tolari enters the story in this beat, by name — seen, heard or spoken of — with nothing said yet of what they have done.');
    expect(planNow(filed.id).truth).toContain('Talia Tolari');
  }, 60_000);

  it('a Fulfill Your Vow that misses plays the plan\'s next escalation step, marked played by its narration', async () => {
    const filed = await filePlan();
    await narrate({ moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', outcome: 'miss', outcomeLabel: 'Miss' });
    const asked = narrationCallsOf(table).at(-1).userText;
    expect(asked).toContain('- [escalation] WHAT THE VOW IS UP AGAINST MOVES.');
    expect(asked).toContain(`"${A3.escalation[0]}"`);
    expect(planNow(filed.id).escalation[0]).toMatchObject({ id: 'e1', done: true, playedBy: narrationIdOf() });
  }, 60_000);

  it('control: another move by Kira tells no clue and marks nothing', async () => {
    const filed = await filePlan();
    await narrate({ moveId: 'gather_information', moveName: 'Gather Information', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      playerNarration: 'I ask the dock crews who saw the raiders.' });
    expect(narrationCallsOf(table).at(-1).userText).not.toContain('[clue]');
    expect(planNow(filed.id).clues.every(c => !c.revealed)).toBe(true);
  }, 60_000);

  describe('the oath: a who-vow\'s plan that names no one is asked for once more', () => {
    const NAMELESS = 'The raids are staged by a faction inside the lanes\' own water trade, using the raiders\' ambushes to push haulers into dependence.';
    const NAMED = 'Broker Ilse Marrow stages the raids from inside the lanes\' water trade, to push haulers into dependence on her supply.';
    /** The oath's reply: its plan for the request DECIDE NOW lists, with the truth `truthOf(call)` gives. */
    const oathReplies = (truthOf) => (call) => {
      const ref = /- id (plan-[^:\s]+-vow):/.exec(call.system ?? '')?.[1] ?? 'plan-x-vow';
      return { prose: 'You set your palm on the cold plating and swear it.',
        sidecar: { newTruths: [], stateChanges: [], plans: [{ id: ref, subject: 'the lane raiders', truth: truthOf(call), wants: 'To keep the lanes afraid.' }] } };
    };
    const swear = async (vowName = VOW) => {
      const { narrateAndPostVowSwearing } = await gmOf(table).import('../../src/narration/narrator.js');
      return onGm(table, () => narrateAndPostVowSwearing({ vow: { name: vowName, rank: 'dangerous', vowId: 'vid-kira' },
        campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), speakerActorId: 'pc-kira' }));
    };
    const vowCalls = () => narrationCallsOf(table).filter(c => /\bvow\b/i.test(c.userText ?? ''));

    it('named on the second asking: that reply stands, and its plan is filed with the name — none is drawn', async () => {
      table.replies = oathReplies((call) => (/THE VOW ASKS WHO/.test(call.userText ?? '') ? NAMED : NAMELESS));
      await swear();
      expect(vowCalls()).toHaveLength(2);
      expect(vowCalls()[1].userText).toContain('THE VOW ASKS WHO, AND THE PLAN YOU DECIDED FOR IT');
      const [plan] = plansOf(table).filter(p => p.kind === 'vow');
      expect(plan.truth).toBe(NAMED);
    }, 60_000);

    it('still no one: the first reply stands as decided, with no name drawn for it', async () => {
      table.replies = oathReplies(() => NAMELESS);
      await swear();
      expect(vowCalls()).toHaveLength(2);
      const [plan] = plansOf(table).filter(p => p.kind === 'vow');
      expect(plan.truth).toBe(NAMELESS);
      expect(plan.truth).not.toMatch(/The one behind it is/);
    }, 60_000);

    it('control: a plan that names someone, and a vow that asks no who, are asked once', async () => {
      table.replies = oathReplies(() => NAMED);
      await swear();
      expect(vowCalls()).toHaveLength(1);
      restore?.();
      restore = await resetSkeletonTable(table);
      table.replies = oathReplies(() => 'The colony ship drifts dark in the Cinder Expanse, her crew long gone.');
      await swear('Find the lost colony ship Verity\'s Hope');
      expect(vowCalls()).toHaveLength(1);
    }, 60_000);
  });
});
