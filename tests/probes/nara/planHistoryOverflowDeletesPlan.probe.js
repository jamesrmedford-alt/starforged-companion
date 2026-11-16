/**
 * NARA-04 · PLAN-HISTORY-OVERFLOW-DELETES-PLAN
 *
 * Scenario: an earlier narration (A) introduced an enemy and its plan was
 * filed undecided (sidecar `newThreats`, issue #354 P2-29). After a player's
 * line, the next narration (B) is asked to decide it (DECIDE NOW) and does —
 * and its fact block also records what the beat showed of it as two `reveals`
 * entries for the one plan (a clue shown; a step played). The table then
 * plays the X-Card on B.
 *
 * Correct (decisions.md → the narrative skeleton: the X-Card "restores the
 * version before a narration that changed it"): the plan is put back as A
 * left it — undecided, with its oracle rolls — because A was not removed.
 *
 * Today: each plan write a narration makes pushes a version onto the page's
 * `previous`, which keeps NARRATION_HISTORY = 3 (worldJournal.js
 * narrationStamp). One narration writes one plan up to once per step of
 * applyPlanSideData: the decision, its escalation clock's link
 * (ensureThreatClock), and one write per `reveals` entry — normaliseReveals
 * does not merge entries of one id. Four writes by B push A's version off the
 * list; undoNarrationEntries then finds no version B did not write and
 * DELETES the page (`else { await page.delete(); }`), taking A's plan and its
 * rolls with it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { skeletonTable, withSidecar, move } from './_skeletonTable.js';

let h;

beforeAll(async () => { h = await skeletonTable(); }, 30_000);
afterAll(() => h?.teardown());
beforeEach(async () => { await h.reset(); });
afterEach(() => h.restore());

const TRUTH = 'The escort is a Keeper drone collecting names.';

/** A introduces the enemy (plan filed undecided); a player speaks; B decides it and records `reveals`. */
async function decideWithReveals(reveals) {
  h.reply = () => withSidecar('A second shape detaches from the dark: an escort.', {
    newTruths: [], stateChanges: [], newThreats: [{ name: 'the escort' }] });
  await h.narrateMove(move());
  const [filed] = h.plans();
  expect(filed, 'A filed the enemy\'s plan, undecided').toMatchObject({ kind: 'threat', truth: '', subject: { name: 'the escort' } });

  // Pat speaks (a whisper — no narration of its own): the X-Card's beat begins after it.
  await h.table.client('pl-1').run(() => ChatMessage.create({ content: 'We hold still.', whisper: ['gm-1'] }));
  await h.table.settle();

  h.reply = (call) => {
    const asked = (call.system ?? '').includes(`- id ${filed.id}: Threat — the escort.`);
    return withSidecar('The escort turns its lamp on Kira and takes one step closer.', {
      newTruths: [], stateChanges: [],
      ...(asked ? {
        plans: [{ id: filed.id, truth: TRUTH, wants: 'A name the crew carries.',
          escalation: ['It steps closer', 'It seals the corridor'], clues: ['A pulse that counts down', 'A Keeper sigil'] }],
        reveals: reveals(filed.id),
      } : {}),
    });
  };
  await h.narrateMove(move({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit', playerNarration: 'I watch the escort.' }));
  const [decided] = h.plans();
  expect(decided, 'B decided it').toMatchObject({ id: filed.id, truth: TRUTH });
  expect(decided.clues[0].revealed).toBe(true);
  expect(decided.escalation[0].done).toBe(true);
  return filed;
}

async function playXCard() {
  await h.table.client('pl-1').chat('!x');
  await h.table.settle();
  await h.table.drain();
}

describe('NARA-04 — an X-Card on the narration that decided a plan puts the plan back as the kept narration left it', () => {
  it('control: B records what it showed as ONE reveals entry — the X-Card restores the undecided plan', async () => {
    const filed = await decideWithReveals(id => [{ id, revealed: ['c1'], advanced: 'e1' }]);
    await playXCard();

    const plans = h.plans();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: filed.id, kind: 'threat', truth: '', status: 'active' });
    expect(plans[0].oracleSeeds).toEqual(filed.oracleSeeds);
  }, 40_000);

  it('B records the same as TWO reveals entries of the one plan — the X-Card still restores the undecided plan', async () => {
    const filed = await decideWithReveals(id => [{ id, revealed: ['c1'] }, { id, advanced: 'e1' }]);
    await playXCard();

    const plans = h.plans();
    expect(plans, 'the plan narration A made is still there').toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: filed.id, kind: 'threat', truth: '', status: 'active' });
    expect(plans[0].oracleSeeds).toEqual(filed.oracleSeeds);
  }, 40_000);
});
