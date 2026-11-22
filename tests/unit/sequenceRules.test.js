/**
 * STARFORGED COMPANION
 * tests/unit/sequenceRules.test.js
 *
 * Issue #302 slice C — the rules the generated sequences expect
 * (tests/helpers/sequence/rules.js) and the model built on them (model.js).
 *
 * The model is only worth comparing a table against if it is right, and if
 * it did not get its answers from the code under test. So this file checks
 * it against the game's own words — the move text the foundry-ironsworn
 * system ships (vendor/foundry-ironsworn/json-packs/starforged-moves) and the
 * play kit summary in docs/rules-reference — never against src/, and a
 * source scan fails if either module starts importing from there.
 *
 * The vendored data is a git submodule; CI checks it out. A local checkout
 * without it (`git submodule update --init vendor/foundry-ironsworn`) skips
 * the move-text comparisons.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  LEGACY_REWARD_TICKS, MOMENTUM_MAX, PROGRESS_TICKS, RANKS, TICKS_PER_BOX, bondReward, fulfilReward, gainMomentum,
  markProgress, outcomeOf, progressScore, rankAbove, rankBelow, rankOf, recommit, sheetRank,
} from '../helpers/sequence/rules.js';
import * as M from '../helpers/sequence/model.js';

const ROOT  = path.resolve(__dirname, '../..');
const MOVES = path.join(ROOT, 'vendor/foundry-ironsworn/json-packs/starforged-moves');
const HAVE_VENDOR = fs.existsSync(MOVES) && fs.readdirSync(MOVES).length > 0;
const moveText = (file) => JSON.parse(fs.readFileSync(path.join(MOVES, file), 'utf8')).system.Text;

/** "troublesome=1 tick; dangerous=2 ticks; formidable=1 box; extreme=2 boxes; epic=3 boxes" → ticks by rank. */
function rewardSentence(text) {
  const out = {};
  for (const [, rank, n, unit] of text.matchAll(/(troublesome|dangerous|formidable|extreme|epic)=(\d+) (tick|box)/g)) {
    out[rank] = Number(n) * (unit === 'box' ? TICKS_PER_BOX : 1);
  }
  return out;
}

describe('the rules are the game\'s, read from its text', () => {
  it.skipIf(!HAVE_VENDOR)('the legacy reward by rank is the sentence in Fulfill Your Vow and in Forge a Bond', () => {
    expect(rewardSentence(moveText('Fulfill_Your_Vow_985a5415860a99e9.json'))).toEqual(LEGACY_REWARD_TICKS);
    expect(rewardSentence(moveText('Forge_a_Bond_287bb4c2b53ea847.json'))).toEqual(LEGACY_REWARD_TICKS);
  });

  it.skipIf(!HAVE_VENDOR)('a weak hit on Fulfill Your Vow pays one rank lower, none for a troublesome quest — the move says so', () => {
    expect(moveText('Fulfill_Your_Vow_985a5415860a99e9.json')).toMatch(/make the legacy reward one rank lower \(none for a troublesome quest\)/);
    expect(RANKS.map(r => fulfilReward(r, 'weak_hit'))).toEqual([0, 1, 2, 4, 8]);
    expect(RANKS.map(r => fulfilReward(r, 'strong_hit'))).toEqual([1, 2, 4, 8, 12]);
    expect(RANKS.map(r => fulfilReward(r, 'miss'))).toEqual([0, 0, 0, 0, 0]);
  });

  it.skipIf(!HAVE_VENDOR)('a hit on Forge a Bond pays the connection\'s rank; the weak hit\'s "as above" is the same reward', () => {
    expect(moveText('Forge_a_Bond_287bb4c2b53ea847.json')).toMatch(/On a __weak hit__, as above, but they ask something more of you first/);
    expect(RANKS.map(r => bondReward(r, 'strong_hit'))).toEqual([1, 2, 4, 8, 12]);
    expect(RANKS.map(r => bondReward(r, 'weak_hit'))).toEqual([1, 2, 4, 8, 12]);
    expect(RANKS.map(r => bondReward(r, 'miss'))).toEqual([0, 0, 0, 0, 0]);
  });

  it.skipIf(!HAVE_VENDOR)('a recommit clears the lower challenge die\'s boxes and raises the rank, epic staying epic — both moves say so', () => {
    const words = /roll both challenge dice, take the lowest value, and clear that number of progress boxes\. Then, raise the (vow|connection)'s rank by one \(if not already epic\)/i;
    expect(moveText('Fulfill_Your_Vow_985a5415860a99e9.json')).toMatch(words);
    expect(moveText('Forge_a_Bond_287bb4c2b53ea847.json')).toMatch(words);
    expect(recommit(24, 'dangerous', [7, 3])).toEqual({ ticks: 12, rank: 'formidable' });
    expect(recommit(8, 'extreme', [9, 9])).toEqual({ ticks: 0, rank: 'epic' });
    expect(recommit(40, 'epic', [1, 10])).toEqual({ ticks: 36, rank: 'epic' });
  });

  it.skipIf(!HAVE_VENDOR)('Reach a Milestone and Develop Your Relationship mark progress per the rank, and roll nothing', () => {
    expect(moveText('Reach_a_Milestone_0d7f13818c1c19ed.json')).toMatch(/you may mark progress per the rank of the vow/);
    expect(moveText('Develop_Your_Relationship_141aec8b92efd14b.json')).toMatch(/you may mark progress per the rank of the connection/);
  });

  it.skipIf(!HAVE_VENDOR)('a session: a vignette at its beginning, or a focus noted at its end, is +1 momentum to every player — never past +10', () => {
    expect(moveText('Begin_a_Session_bb0a732e3b1c7ea1.json')).toMatch(/envision a brief vignette[^.]*\. Then, all players take \+1 momentum/);
    expect(moveText('End_a_Session_005fa1851e72ab46.json')).toMatch(/you would like to give focus in your next session, make note of it and take \+1 momentum/);
    const summary = fs.readFileSync(path.join(ROOT, 'docs/rules-reference/rulebook-summary.md'), 'utf8');
    expect(summary).toMatch(/Momentum \([–-]6 to \+10\)/);
    expect(MOMENTUM_MAX).toBe(10);
    expect([2, 9, 10].map(m => gainMomentum(m))).toEqual([3, 10, 10]);
  });

  it('progress per mark is the play kit\'s: 3 boxes, 2 boxes, 1 box, 2 ticks, 1 tick', () => {
    const kit = fs.readFileSync(path.join(ROOT, 'docs/rules-reference/playkit-rules-and-coverage.md'), 'utf8');
    const line = kit.match(/troublesome \*\*\+(\d+)\*\*[^,]*, dangerous \*\*\+(\d+)\*\*[^,]*, formidable\s+\*\*\+(\d+)\*\*[^,]*, extreme \*\*\+(\d+)\*\*, epic \*\*\+(\d+)\*\*/);
    expect(line, 'the play kit\'s "Mark progress" line').not.toBeNull();
    expect(RANKS.map(r => PROGRESS_TICKS[r])).toEqual(line.slice(1).map(Number));
    expect(markProgress(36, 'troublesome')).toBe(40);           // never past the tenth box
    expect(markProgress(0, 'epic')).toBe(1);
  });

  it('a score beats a die only when greater; a progress score is the boxes filled', () => {
    expect(outcomeOf(5, [4, 3])).toBe('strong_hit');
    expect(outcomeOf(5, [5, 3])).toBe('weak_hit');              // a tie is not beaten
    expect(outcomeOf(5, [5, 5])).toBe('miss');
    expect(outcomeOf(10, [10, 10])).toBe('miss');
    expect(outcomeOf(0, [1, 1])).toBe('miss');
    expect([0, 3, 4, 39, 40].map(progressScore)).toEqual([0, 0, 1, 9, 10]);
  });

  it('ranks read by name or as the sheet stores them, 1–5', () => {
    expect(RANKS.map(sheetRank)).toEqual([1, 2, 3, 4, 5]);
    expect([1, 2, 3, 4, 5].map(rankOf)).toEqual(RANKS);
    expect(rankOf('Dangerous')).toBe('dangerous');
    expect(rankOf(0)).toBeNull();
    expect(rankOf('legendary')).toBeNull();
    expect(RANKS.map(rankBelow)).toEqual([null, 'troublesome', 'dangerous', 'formidable', 'extreme']);
    expect(RANKS.map(rankAbove)).toEqual(['dangerous', 'formidable', 'extreme', 'epic', 'epic']);
  });
});

describe('the model moves by those rules', () => {
  const fresh = () => M.createModel(['pc-kira', 'pc-ash']);

  it('a vow: marked per its rank, fulfilled on a hit with the reward on the crew\'s quests track', () => {
    const model = fresh();
    const vow = M.addVow(model, { pc: 'pc-kira', name: 'Find Kade', rank: 'formidable' });
    for (let i = 0; i < 6; i++) M.reachMilestone(model, vow);
    expect(vow.ticks).toBe(24);
    expect(M.fulfilVow(model, vow, [6, 6])).toBe('miss');
    expect(vow).toMatchObject({ status: 'open', offer: true, ticks: 24 });
    expect(model.legacy.quests).toBe(0);

    M.recommitVow(model, vow, [2, 5]);
    expect(vow).toMatchObject({ ticks: 16, rank: 'extreme', offer: false });

    expect(M.fulfilVow(model, vow, [3, 9])).toBe('weak_hit');
    expect(vow.status).toBe('fulfilled');
    expect(model.legacy.quests).toBe(4);                         // extreme, one rank lower: formidable's box
  });

  it('a connection: developed per its rank, bonded on a hit with the reward on the bonds track', () => {
    const model = fresh();
    const sable = M.addConnection(model, { name: 'Sable', rank: 'dangerous', holder: 'pc-ash' });
    M.developRelationship(model, sable);
    M.developRelationship(model, sable);
    expect(sable.ticks).toBe(16);
    expect(M.forgeBond(model, sable, [1, 2])).toBe('strong_hit');
    expect(sable.bonded).toBe(true);
    expect(model.legacy.bonds).toBe(2);
  });

  it('a session: ended with a focus and begun with a vignette, every character gains one momentum each time; with neither, none', () => {
    const model = fresh();
    expect(M.canPlay(model)).toBe(true);
    M.endSession(model, { focus: true });
    expect(model.session.active).toBe(false);
    expect(M.canPlay(model)).toBe(false);                       // between sessions no move is made
    expect(model.momentum).toEqual({ 'pc-kira': 3, 'pc-ash': 3 });
    M.beginSession(model, { vignette: true });
    expect(model.momentum).toEqual({ 'pc-kira': 4, 'pc-ash': 4 });
    M.endSession(model, { focus: false });
    M.beginSession(model, { vignette: false });
    expect(model.momentum).toEqual({ 'pc-kira': 4, 'pc-ash': 4 });
    expect(M.expected(model)).toMatchObject({ sessionOpen: true });
  });

  it('the GM\'s page: after a dropped connection nothing that needs her happens until it reloads', () => {
    const model = fresh();
    M.gmDropped(model);
    expect(M.canPlay(model)).toBe(false);
    M.gmReloaded(model);
    expect(M.canPlay(model)).toBe(true);
  });

  it('expected() shows every sheet the crew\'s legacy, each character their own vows, and a holder their bond', () => {
    const model = fresh();
    const vow = M.addVow(model, { pc: 'pc-kira', name: 'Find Kade', rank: 'troublesome' });
    M.addVow(model, { pc: 'pc-ash', name: 'Find Kade', rank: 'epic' });
    const vega = M.addConnection(model, { name: 'Vega', rank: 'epic', holder: 'pc-ash' });
    for (let i = 0; i < 4; i++) M.reachMilestone(model, vow);
    M.fulfilVow(model, vow, [1, 1]);
    M.renameConnection(model, vega, 'Sable');
    expect(M.expected(model)).toEqual({
      legacy: { quests: 1, bonds: 0 },
      pcs: {
        'pc-kira': {
          momentum: 2, legacyOnSheet: { quests: 1, bonds: 0 },
          vows: [{ ref: 'v1', name: 'Find Kade', rank: 'troublesome', ticks: 40, fulfilled: true }],
          bonds: [],
        },
        'pc-ash': {
          momentum: 2, legacyOnSheet: { quests: 1, bonds: 0 },
          vows: [{ ref: 'v2', name: 'Find Kade', rank: 'epic', ticks: 0, fulfilled: false }],
          bonds: [{ connection: 'c3', name: 'Sable', rank: 'epic', ticks: 0, forged: false }],
        },
      },
      connections: [{ ref: 'c3', name: 'Sable', rank: 'epic', ticks: 0, bonded: false }],
      sessionOpen: true,
      moveInFlight: false,
    });
  });
});

describe('the model is independent of the code it checks', () => {
  it('rules.js and model.js import nothing from src/', () => {
    for (const file of ['rules.js', 'model.js']) {
      const source = fs.readFileSync(path.join(ROOT, 'tests/helpers/sequence', file), 'utf8');
      const imports = [...source.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map(m => m[1]);
      expect(imports.filter(spec => /(^|\/)src\//.test(spec)), `${file} imports`).toEqual([]);
      expect(imports.every(spec => spec.startsWith('./')), `${file} imports only its neighbours: ${imports.join(', ')}`).toBe(true);
    }
  });
});
