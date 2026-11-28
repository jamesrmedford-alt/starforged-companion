/**
 * STARFORGED COMPANION
 * tests/unit/revealFilesWhatWasTold.test.js
 *
 * Issue #402, change 1b, on round 10's recording: a reveal files what the
 * narration told. At a75 (Fulfill Your Vow, a strong hit) the narration told
 * a name and "one hand behind all of it", and its fact block marked the vow's
 * plan `"revealed": ["truth"]`. The plan's whole text — the foreman runs the
 * raids, why, what he holds, and a second name — was then filed as
 * established, the GM's ("established (the GM): … The raids are run by the
 * foreman …", a78's recap record, s3-44), and the recap told it.
 *
 * Replayed here through the real narration pipeline with a75's own reply and
 * the plan's truth as the record held it: the beat files its own fact block,
 * the plan is marked revealed, and its hidden text is Lore pending the GM —
 * no sentence of it is a scene fact, canon, or a truth on the record.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, narrateMoveOn, moveResolution,
} from '../helpers/skeletonTable.js';

const RUN = fileURLToPath(new URL('../../test/ci/playwright/explorations/long-haul-live-20261127-202557/replay.json', import.meta.url));
const exchanges = JSON.parse(readFileSync(RUN, 'utf8')).recording.exchanges;
const textOf = (e) => (typeof e?.response === 'object' ? e.response?.content?.[0]?.text : e?.response) ?? '';
const narrationAt = (step) => exchanges.find(e => e.step === step && /narrateResolution$/.test(e.kind));

const VOW = 'Find who is raiding the Cinder Expanse lanes';
const VOW_ID = 'vow-lanes-r10';
const RECORDED_PLAN = 'sk-xV3y67JwXvhLcori';

// a75's reply, as recorded: its prose and its fact block.
const A75 = textOf(narrationAt('a75'));
const A75_PROSE = A75.slice(0, A75.indexOf('```json')).trim();
const A75_BLOCK = JSON.parse(A75.slice(A75.indexOf('```json') + 7, A75.lastIndexOf('```')));
// The plan's truth as the record held it at the fulfilment (a78's recap request, s3-44).
const A78 = exchanges.find(e => e.step === 'a78' && /getCampaignRecap$/.test(e.kind))?.user ?? '';
const PLAN_TRUTH = (/established \(the GM\): Find who is raiding the Cinder Expanse lanes — (.+?) — established \(the dice\)/.exec(A78) ?? [])[1] ?? '';
// Its sentences the prose never told.
const UNTOLD = [
  'The raids are run by the foreman who once collected on Mira\'s family debt',
  'He began the raids to gain power over the lanes',
  'he still holds the manifest with Mira\'s forged signature as leverage',
];

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const holdsUntold = (text) => UNTOLD.some(s => String(text ?? '').includes(s));

/** The truths the session record holds, as its `truth.set` events. */
async function recordedTruths() {
  const record = await gmOf(table).import('../../src/record/record.js');
  await gmOf(table).run(() => record.recordSettled());
  const pages = gmOf(table).run(() => game.journal.contents.flatMap(j => j.pages?.contents ?? []));
  return pages.flatMap(p => Object.values(p.flags?.[MODULE_ID]?.sessionRecord?.events ?? {}))
    .filter(e => e.k === 'truth.set').map(e => e.d?.fact ?? '');
}

async function lore() {
  const { getConfirmedLore, getNarratorAssertedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => ({ confirmed: getConfirmedLore(null), pending: getNarratorAssertedLore(null) }));
}

describe('round 10\'s a75: the reveal files what the narration told (issue #402, change 1b)', () => {
  it('reads the kept run (setup)', () => {
    expect(A75_PROSE).toMatch(/^"Talia Tolari," Okoro says/);
    expect(A75_BLOCK.reveals).toEqual([{ id: RECORDED_PLAN, revealed: ['truth'], resolved: true }]);
    expect(PLAN_TRUTH).toMatch(/^The raids are run by the foreman/);
    expect(PLAN_TRUTH).toMatch(/The one behind it is Talia Tolari\.$/);
    for (const s of UNTOLD) expect(A75_PROSE, 'the prose does not tell it').not.toContain(s);
  });

  it('the beat files its own fact block; the plan is revealed, and no sentence the prose did not tell is filed as established', async () => {
    const { createSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    const plan = await onGm(table, () => createSkeleton({
      kind: 'vow', subject: { type: 'vow', id: VOW_ID, name: VOW }, truth: PLAN_TRUTH,
      sceneId: 'sc-earlier', sessionId: 's-1',
    }, { byGm: true }));
    const sidecar = { ...A75_BLOCK, reveals: A75_BLOCK.reveals.map(r => ({ ...r, id: plan.id })) };
    table.replies = () => ({ prose: A75_PROSE, sidecar });
    await narrateMoveOn(table, moveResolution({
      moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      playerNarration: 'Attempt to fulfill your vow.', endingTrackIds: [VOW_ID],
    }));

    expect(plansOf(table).find(p => p.id === plan.id), 'the plan is marked revealed').toMatchObject({ truthRevealed: true });

    const facts = (stored().sceneTruths ?? []).filter(t => !t.retracted).map(t => t.fact);
    expect(facts, 'the block\'s own facts are filed').toEqual(expect.arrayContaining(A75_BLOCK.newTruths.map(t => t.fact)));
    expect(facts.filter(holdsUntold), 'no scene fact the prose did not tell').toEqual([]);

    const { confirmed, pending } = await lore();
    expect(confirmed.filter(e => holdsUntold(e.text)), 'nothing of it is canon').toEqual([]);
    expect(pending.filter(e => e.text === PLAN_TRUTH), 'the plan\'s text is the GM\'s to confirm').toHaveLength(1);

    expect((await recordedTruths()).filter(holdsUntold), 'and none is a truth on the session record').toEqual([]);
  }, 60_000);
});
