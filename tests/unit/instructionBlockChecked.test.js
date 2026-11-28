/**
 * STARFORGED COMPANION
 * tests/unit/instructionBlockChecked.test.js
 *
 * Issue #402, change 3 (the maintainer's call: "execute issue 402"; D3 — the
 * check mends what is certain, R1 and R2, and reports R3 to the GM). Every
 * check the module had read the narrator's output; round 10's faults came
 * from what it was told. Now the TELL / NOT YET / NOT SO block is read
 * against the module's own data where it is put together
 * (moves/contracts/blockCheck.js, obligations.js mendResultLines):
 *   R1  a weak hit's line asks for the outcome's cost only when it names one;
 *   R2  an effect that waits on the player's spend is NOT YET — a Repair's
 *       hit gives points, and the mending is what they are spent on, after;
 *   R3  a who-vow's plan handed over for its reveal names one culprit the
 *       story has met — else the GM is told.
 * And one reader says who the story has met (world/storyPeople.js): the oath's
 * DECIDE NOW, namedIfAWhoVow and the stranger check read the pending draft
 * "Foreman" alike, where round 10's two of them disagreed.
 *
 * Over the kept instruction blocks of rounds 5 to 10, R1 and R2 flag five
 * steps, each a Repair narrated as mended (labelled: all five right) — the
 * four the scope knew (round 6's a62, round 7's a56, round 9's a58, round 10's
 * a57) and round 5's a60 ("The seal holds, but only just … Your supply of
 * sealant runs lower than it should"), the same fault — and nothing else.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { instructionFaults, outcomeNamesACost, revealFault, WEAK_HIT_COST_CLAUSE } from '../../src/moves/contracts/blockCheck.js';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';
import { mapConsequences } from '../../src/moves/resolver.js';
import { MOVES } from '../../src/schemas.js';
import { moveDisplayName } from '../../src/system/i18n.js';
import { truthNamesSomeone, strangerNamedIn, peopleNamedIn, truthWithWho } from '../../src/world/skeletons.js';
import { storyPeople } from '../../src/world/storyPeople.js';

const MODULE_ID = 'starforged-companion';
const EXPLORATIONS = path.resolve(__dirname, '../../test/ci/playwright/explorations');
const ROUNDS = {
  'long-haul-live-20261125-164201': 5, 'long-haul-live-20261125-225635': 6, 'long-haul-live-20261125-232143': 6,
  'long-haul-live-20261126-030646': 7, 'long-haul-live-20261126-184225': 8, 'long-haul-live-20261127-041734': 9,
  'long-haul-live-20261127-202557': 10,
};
const runOf = (folder) => JSON.parse(fs.readFileSync(path.join(EXPLORATIONS, folder, 'replay.json'), 'utf8'));
const replyOf = (x) => x.response.content.map(c => c.text ?? '').join('');
const MOVE_BY_NAME = new Map(Object.keys(MOVES).map(id => [String(moveDisplayName(id) ?? '').toLowerCase(), id]));

/** The lines a narrator request was given, read back: `{ kind, list, text }` (a line's own wrapped rows joined). */
function linesOf(user) {
  const at = String(user ?? '').indexOf('WHAT THIS NARRATION MUST TELL, AND MUST NOT');
  if (at < 0) return [];
  const out = [];
  let list = null;
  for (const row of user.slice(at).split('\n').slice(1)) {
    const head = /^(TELL|NOT YET|NOT SO) — /.exec(row);
    if (head) { list = head[1]; continue; }
    const line = /^- \[([a-z-]+)\] (.+)$/.exec(row);
    if (line && list) { out.push({ kind: line[1], list, text: line[2] }); continue; }
    if (/^ {2}\S/.test(row) && out.length) { out.at(-1).text += `\n${row}`; continue; }
    if (row.trim()) break;
  }
  return out;
}

/** A recorded move request's block, as the check reads one being built. */
function blockOf(user) {
  const m = /\[MOVE: ([^\]+]+?)(?: \+[a-z]+)?\] (?:\[ROLL: [^\]]*\] )?\[OUTCOME: ([^\]]+)\](?: \[CONSEQUENCE: ([^\]]*)\])?/.exec(String(user ?? ''));
  if (!m) return null;
  return { lines: linesOf(user), moveId: MOVE_BY_NAME.get(m[1].trim().toLowerCase()) ?? null,
    outcome: m[2].trim().toLowerCase().replace(/\s+/g, '_'), consequences: m[3] ?? null };
}

const REPAIR_STAKES = { hit: 'The plating holds and the guns and engine feeds run true again.', miss: 'The patch fails or the work takes longer than the berth allows.' };
const stakesOf = (lines) => lines.find(o => o.kind === 'stakes')?.text ?? '';

describe('R1 and R2 over the kept instruction blocks of rounds 5 to 10', () => {
  it('flag the five Repair steps told as mended, and nothing else', () => {
    const flagged = [];
    let blocks = 0;
    for (const [folder, round] of Object.entries(ROUNDS)) {
      for (const x of runOf(folder).recording.exchanges) {
        if (!/^callNarratorAPI>narrate(Resolution|PacedInput|Round)$/.test(x.kind) || (x.user ?? '').includes('## YOUR DRAFT')) continue;
        const block = blockOf(x.user);
        if (!block) continue;
        blocks++;
        const faults = instructionFaults(block);
        if (faults.length) flagged.push(`r${round} ${x.step} ${block.moveId} ${block.outcome} ${faults.map(f => f.rule).join('+')}`);
      }
    }
    expect(blocks).toBeGreaterThan(100);
    expect(flagged).toEqual([
      'r5 a60 repair weak_hit R1+R2',
      'r6 a62 repair strong_hit R2',
      'r7 a56 repair weak_hit R1+R2',
      'r9 a58 repair weak_hit R1+R2',
      'r10 a57 repair weak_hit R1+R2',
    ]);
  });

  it('round 10\'s a57 as it was sent: the weak hit asked for a cost its outcome does not name, and its narration made one up', () => {
    const x = runOf('long-haul-live-20261127-202557').recording.exchanges.find(e => e.step === 'a57' && e.kind === 'callNarratorAPI>narrateResolution');
    const block = blockOf(x.user);
    expect(block).toMatchObject({ moveId: 'repair', outcome: 'weak_hit', consequences: 'Gain repair points: facility 3, field 1, under fire 0. Same spend options.' });
    expect(stakesOf(block.lines)).toContain(WEAK_HIT_COST_CLAUSE);
    expect(replyOf(x)).toContain('your supplies run thinner than you left them');
  });
});

describe('the mend, where the block is put together', () => {
  it('a Repair\'s hit gives points: its stakes tell the work, not the mending, and [spend] is NOT YET — a strong hit as a weak', () => {
    for (const outcome of ['weak_hit', 'strong_hit']) {
      const lines = obligationsFor({ mode: 'move', resolution: { moveId: 'repair', outcome, consequences: mapConsequences('repair', outcome, false), stakes: REPAIR_STAKES } });
      const stakes = stakesOf(lines);
      expect(stakes, outcome).toContain('On a hit: The plating holds and the guns and engine feeds run true again.');
      expect(stakes, outcome).toContain('it gives repair points, and the player has not spent them');
      expect(stakes, outcome).not.toContain(WEAK_HIT_COST_CLAUSE);
      expect(stakes, outcome).not.toContain('deliver the hit as stated');
      const spend = lines.find(o => o.kind === 'spend');
      expect(spend, outcome).toMatchObject({ list: 'NOT YET' });
      expect(spend.text, outcome).toMatch(/^REPAIR POINTS ARE NOT SPENT YET\. .* no supply or other cost it takes\.$/);
      expect(lines.indexOf(spend), outcome).toBe(lines.findIndex(o => o.kind === 'stakes') + 1);
      // The mended block passes its own check.
      expect(instructionFaults({ lines, moveId: 'repair', outcome, consequences: mapConsequences('repair', outcome, false) }), outcome).toEqual([]);
    }
  });

  it('a weak hit whose outcome names a cost keeps the clause; one whose outcome names none is told to add none', () => {
    const gather = obligationsFor({ mode: 'move', resolution: { moveId: 'gather_information', outcome: 'weak_hit',
      consequences: mapConsequences('gather_information', 'weak_hit', false), stakes: { hit: 'You learn who ran dark.', miss: 'They see you asking.' } } });
    expect(stakesOf(gather)).toContain(WEAK_HIT_COST_CLAUSE);
    expect(gather.some(o => o.kind === 'spend')).toBe(false);
    const bonded = obligationsFor({ mode: 'move', resolution: { moveId: 'develop_your_relationship', outcome: 'weak_hit',
      consequences: mapConsequences('develop_your_relationship', 'weak_hit', false), stakes: { hit: 'She trusts you with the ledger page.', miss: 'She keeps her own counsel.' } } });
    expect(stakesOf(bonded)).toContain('The move outcome names no cost or complication, and none is added.');
    expect(stakesOf(bonded)).not.toContain(WEAK_HIT_COST_CLAUSE);
  });

  it('which moves\' weak hits name no cost, read from their own outcomes — pinned, so a new move\'s is read before it ships', () => {
    const none = Object.keys(MOVES).filter((id) => {
      const c = mapConsequences(id, 'weak_hit', false);
      return c && !outcomeNamesACost(c);
    }).sort();
    expect(none).toEqual([
      'advance', 'ask_the_oracle', 'begin_a_session', 'change_your_fate', 'confront_chaos', 'continue_a_legacy',
      'develop_your_relationship', 'earn_experience', 'end_a_session', 'make_a_discovery', 'overcome_destruction',
      'reach_a_milestone', 'repair', 'set_a_flag', 'take_a_break',
    ]);
  });
});

describe('R3: a who-vow\'s plan handed over for its reveal names one culprit the story has met', () => {
  const ROUND_10 = 'The raids are run by the foreman who once collected on Mira\'s family debt, using the freight and the sealed plant as cover. '
    + 'He began the raids to gain power over the lanes and to keep the plant\'s contents moving unseen, and he still holds the manifest with '
    + 'Mira\'s forged signature as leverage.';
  const STORY = { people: ['Tamsin Okoro'], drafts: ['Foreman', 'Ilse Kestrel', 'Customs Clerk', 'Cargo Hook Man'], notNames: ['Mira Kestrel', 'Kobayashi IV', 'Hollow Spire', 'Bleakhold Station'] };
  // Whom a truth names, read against the story as the narrator reads it (narrator.js noteRevealFaults).
  const named = (truth) => peopleNamedIn(truth, { people: STORY.people, exact: STORY.drafts, notNames: STORY.notNames });

  it('round 10\'s a75 is flagged: its plan named the foreman, and the name the code appended — whom the story never met', () => {
    const fault = revealFault(named(truthWithWho(ROUND_10, 'Talia Tolari')));
    expect(fault).toMatchObject({ rule: 'R3', why: 'it names 2 people as the one behind it' });
    expect(fault.named).toEqual([{ name: 'Foreman', met: true }, { name: 'Talia Tolari', met: false }]);
  });

  it('the plan as the oath decided it names one culprit, met: no fault', () => {
    expect(revealFault(named(ROUND_10))).toBeNull();
  });

  it('round 8\'s, a stranger; round 1\'s, no one', () => {
    expect(revealFault(named('The raids are orchestrated by Dalen Voss, a member of the Hollow Spire administration.')))
      .toMatchObject({ why: 'it names someone the story has not met', named: [{ name: 'Dalen Voss', met: false }] });
    expect(revealFault(named('The raids are the work of a faction that has lost its footing.'))).toMatchObject({ why: 'it names no one' });
  });
});

describe('one reader says who the story has met (change 3b)', () => {
  const card = (id, at, drafts) => ({ id, timestamp: at, flags: { [MODULE_ID]: { draftEntityCard: true, drafts } } });
  const row = (index, type, name, status = 'pending') => ({ index, type, name, status, description: '' });
  beforeEach(() => {
    game.actors._reset();
    game.actors._set('npc-tamsin', makeTestActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-tamsin', name: 'Tamsin Okoro', active: true } } } }));
    game.actors._set('set-bleak', makeTestActor({ id: 'set-bleak', name: 'Bleakhold Station', type: 'location',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold Station' } } } }));
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
    game.messages = { contents: [card('card-a2', 1_000, [row(0, 'connection', 'Foreman')]), card('card-a9', 2_000, [row(0, 'connection', 'Tamsin')])] };
  });

  it('the recorded connections, the pending drafts (never a recorded name) and the names that are no one\'s', () => {
    const state = { currentSessionId: 'sess-1', connectionIds: ['npc-tamsin'], settlementIds: ['set-bleak'], dismissedEntities: [] };
    const story = storyPeople(state);
    expect(story.people).toEqual(['Tamsin Okoro']);
    expect(story.drafts).toEqual(['Foreman']);
    expect(story.notNames).toEqual(expect.arrayContaining(['Bleakhold Station', 'Mira Kestrel']));
  });

  it('round 10\'s truth with the draft "Foreman": the three callers agree the culprit is met', () => {
    const state = { currentSessionId: 'sess-1', connectionIds: ['npc-tamsin'], settlementIds: ['set-bleak'], dismissedEntities: [] };
    const story = storyPeople(state);
    const truth = 'The raids are run by the foreman who once collected on Mira\'s family debt, using the freight as cover.';
    // The oath's DECIDE NOW offers him; namedIfAWhoVow finds the truth names someone, so draws no name; the stranger check finds no stranger.
    expect([...story.people, ...story.drafts]).toContain('Foreman');
    expect(truthNamesSomeone(truth, { people: story.people, exact: story.drafts, notNames: story.notNames })).toBe(true);
    expect(strangerNamedIn(truth, { people: story.people, exact: story.drafts, notNames: story.notNames })).toBeNull();
    expect(peopleNamedIn(truth, { people: story.people, exact: story.drafts, notNames: story.notNames })).toEqual([{ name: 'Foreman', met: true }]);
  });

  it('as round 10 ran, the readers disagreed: without the drafts, the same truth named no one', () => {
    const truth = 'The raids are run by the foreman who once collected on Mira\'s family debt, using the freight as cover.';
    expect(truthNamesSomeone(truth, { people: ['Tamsin Okoro'] })).toBe(false);
    expect(truthNamesSomeone(truth, { people: ['Tamsin Okoro'], exact: ['Foreman'] })).toBe(true);
  });
});
