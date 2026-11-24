/**
 * STARFORGED COMPANION
 * tests/unit/exploreSetPieces.test.js
 *
 * The AI playtest runner meets the session set-pieces built from oracle rolls
 * (issue #381, overhaul 6): the opening, the closing cutaway and the
 * spotlight vignette are each handed MATERIAL — results rolled on the game's
 * tables — and account for each in their fact block (`builtFrom`).
 *
 *   - the rehearsal's stand-in answers all three kinds as a set-piece, writes
 *     each result into its prose and its account into the fact block — and
 *     its forgetful variant neither (lib/rehearsal.mjs);
 *   - the review counts them (lib/review.mjs setPiecesOf: design #381's count
 *     1, each rolled result in its scene; count 7, each spotlight the Begin
 *     card rolled followed by its cutaway or by the note that it is the
 *     table's to envision) and the scorecard says so;
 *   - a set-piece's dice stay a stream of their own in a run and its replay,
 *     the roller's draws for it included (lib/world.mjs installDiceScript),
 *     so the prices a kept run recorded still come back where it used them.
 *
 * The MATERIAL here is the module's own (src/session/sceneSeeds.js
 * rollOpeningSeeds, formatMaterial, markSeedsUsed): the stand-in and the count
 * are held to what the producer writes and reads.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { formatMaterial, markSeedsUsed, rollOpeningSeeds, rollSpotlightSeeds } from '../../src/session/sceneSeeds.js';
import { createRehearsal } from '../../test/ci/playwright/lib/rehearsal.mjs';
import { materialOf, scorecard, setPieceKindOf, setPiecesOf } from '../../test/ci/playwright/lib/review.mjs';
import { installDiceScript } from '../../test/ci/playwright/lib/world.mjs';

/** A draw that hands out `faces` in order. */
const scripted = (faces) => { const q = [...faces]; return () => { if (!q.length) throw new Error('out of dice'); return q.shift(); }; };

// A beat-less scene charter is enough for the stand-in's narrator: it rolls
// when the charter has beats.
const CHARTER = {
  name: 'set-pieces', persona: 'p', goal: 'g', facts: [], cast: {}, seed: { pc: { name: 'Mira Kestrel' } },
  beats: [{ id: 'b1', n: 1, session: 1, title: 'Begin a Session', check: { type: 'sessionBegun', n: 1 } }],
  rehearsal: [{ beat: 1, action: 'say', text: '!begin-session' }],
};
const SIDECAR = '## RESPONSE FORMAT — MANDATORY SIDECAR';
const playerTurn = { system: 'You are playtesting', tools: [{ name: 'take_action' }], messages: [{ role: 'user', content: 'CURRENT BEAT: 1 of 1 [session 1] — Begin\n\nYOUR SCREEN NOW:\n[m1] Gamemaster: hello' }] };
const replyOf = (r, user) => r.reply({ system: `NARRATOR ROLE AND VOICE\n${SIDECAR}`, messages: [{ role: 'user', content: user }] }).content[0].text;
const split = (text) => { const [prose, json] = text.split('```json'); return { prose: prose.trim(), block: json ? JSON.parse(json.split('```')[0]) : null }; };

// The opening's material, as the module rolls and words it.
const OPENING_SEEDS = () => rollOpeningSeeds({ present: ['Mira Kestrel'], placeKnown: true }, scripted([14, 20, 5, 6, 63, 18, 7, 8]));
const OPENING = (seeds = OPENING_SEEDS()) => `OPENING VIGNETTE — begin-session.\n\nActive players: Mira Kestrel.\n\n${formatMaterial(seeds)}\n\nThree to five sentences.`;

describe('the rehearsal\'s stand-in, at a session set-piece', () => {
  it('answers each of the three kinds — opening, closing, spotlight — as a set-piece', () => {
    for (const first of ['OPENING VIGNETTE — begin-session.', 'CLOSING VIGNETTE — end-session cutaway.', 'SPOTLIGHT VIGNETTE — begin-session.']) {
      expect(setPieceKindOf(`${first}\n\nMore.`)).toBe(first.split(' ')[0].toLowerCase());
      const r = createRehearsal({ charter: CHARTER });
      r.reply(playerTurn);
      expect(replyOf(r, `${first}\n\nNo material.`), first).toMatch(/^The ship ticks as it cools, and for a moment nothing is asked of anyone\./);
    }
    expect(setPieceKindOf('A line of play: I look around.')).toBeNull();
  });

  it('writes each MATERIAL result into its prose and accounts for it in its fact block — the module finds every one used', () => {
    const seeds = OPENING_SEEDS();
    const r = createRehearsal({ charter: CHARTER });
    r.reply(playerTurn);
    const { prose, block } = split(replyOf(r, OPENING(seeds)));
    expect(prose).toContain('Bolster Debt.');
    expect(prose).toContain('Makeshift Container.');
    expect(block.builtFrom).toEqual([{ n: 1, words: 'Bolster Debt' }, { n: 2, words: 'Makeshift Container' }]);
    // The module's own reading of that account (narrator.js applies it so).
    markSeedsUsed(seeds, block.builtFrom, prose);
    expect(seeds.map(s => s.used)).toEqual(['Bolster Debt', 'Makeshift Container']);
  });

  it('the forgetful stand-in uses none and accounts for none — the module finds none used', () => {
    const seeds = OPENING_SEEDS();
    const r = createRehearsal({ charter: CHARTER, forget: true });
    r.reply(playerTurn);
    const { prose, block } = split(replyOf(r, OPENING(seeds)));
    expect(prose).not.toContain('Bolster Debt');
    expect(block.builtFrom).toBeUndefined();
    markSeedsUsed(seeds, block.builtFrom ?? [], prose);
    expect(seeds.map(s => s.used)).toEqual([false, false]);
  });
});

describe('the MATERIAL block, read', () => {
  it('each numbered result with its label, tables and dice, and the second under it', () => {
    const material = materialOf(OPENING());
    expect(material).toEqual([
      expect.objectContaining({ n: 1, label: 'What Mira Kestrel is doing in this lull', source: 'Action + Theme', rolls: '14, 20', result: 'Bolster Debt' }),
      expect.objectContaining({ n: 2, label: 'What the scene\'s eye rests on', source: 'Descriptor + Focus', rolls: '63, 18', result: 'Makeshift Container' }),
    ]);
    expect(material[0].second).toBeTruthy();
    const spotlight = formatMaterial(rollSpotlightSeeds({ roll: 37, result: 'A character receives an unexpected message' }, scripted([1, 2, 3, 4, 5, 6, 7, 8])), { spotlight: true });
    expect(materialOf(`SPOTLIGHT VIGNETTE — begin-session.\n\n${spotlight}`)[0]).toMatchObject({ n: 1, label: 'What the vignette shows', source: 'Spotlight Vignette', rolls: '37', result: 'A character receives an unexpected message' });
    expect(materialOf('OPENING VIGNETTE — begin-session.\n\nNo material here.')).toEqual([]);
  });
});

describe('the review\'s counts of the set-pieces (design #381, counts 1 and 7)', () => {
  const exchange = (step, user, text) => ({ step, kind: 'callNarratorAPI>narrateSessionVignette', user, response: { content: [{ type: 'text', text }] } });
  const block = (o) => `\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;

  it('count 1: each result found in its scene, not used, claimed, the second taken, or not known with no fact block', () => {
    const user = OPENING();
    const p = setPiecesOf({ exchanges: [
      exchange('a2', user, `Mira squares a debt in the ledger. A makeshift container of spare parts.${block({ builtFrom: [{ n: 1, words: 'squares a debt in the ledger' }, { n: 2, words: 'a makeshift container', second: true }] })}`),
      exchange('a40', user.replace('OPENING', 'CLOSING').replace('begin-session.', 'end-session cutaway.'), `The docks are quiet.${block({ builtFrom: [{ n: 1, words: 'the ledger burns' }] })}`),
      exchange('a41', user, 'The docks are quiet.'),
      { step: 'a3', kind: 'callClassifierAPI>classifyInput', user: 'A line of play.', response: { content: [{ type: 'text', text: '{}' }] } },
    ] });
    expect(p.scenes.map(s => `${s.step} ${s.kind} ${s.factBlock}`)).toEqual(['a2 opening true', 'a40 closing true', 'a41 opening false']);
    expect(p.scenes[0].results.map(r => [r.used, r.tookSecond ?? false])).toEqual([['squares a debt in the ledger', false], ['a makeshift container', true]]);
    expect(p.scenes[1].results[0]).toMatchObject({ used: false, claimed: 'the ledger burns' });
    expect(p.scenes[1].results[1]).toMatchObject({ used: false });
    expect(p.scenes[2].results.map(r => r.used), 'no fact block: nothing is known').toEqual([null, null]);
    expect(p.totals).toMatchObject({ scenes: 3, byKind: { opening: 2, closing: 1, spotlight: 0 }, results: 6, used: 2, notUsed: 2, unknown: 2, claimed: 1, tookSecond: 1 });
  });

  it('count 1 from the stand-in\'s own replies: all used — and none by the forgetful one', () => {
    const user = OPENING();
    const remembers = createRehearsal({ charter: CHARTER }); remembers.reply(playerTurn);
    const forgets = createRehearsal({ charter: CHARTER, forget: true }); forgets.reply(playerTurn);
    expect(setPiecesOf({ exchanges: [exchange('a2', user, replyOf(remembers, user))] }).totals).toMatchObject({ results: 2, used: 2, notUsed: 0 });
    expect(setPiecesOf({ exchanges: [exchange('a2', user, replyOf(forgets, user))] }).totals).toMatchObject({ results: 2, used: 0, notUsed: 2 });
  });

  // The chat as the observer records it: a card's text is its markup with the tags off.
  const msg = (step, text, extra = {}) => ({ id: `m-${step}-${text.length}`, step, text, narrator: false, vignette: null, ...extra });
  const RESULT = 'A character receives an unexpected message';
  const BEGIN = (tail = '') => msg('a2', `Begin a Session Flagged content reviewed; scene set. Spotlight vignette: ${RESULT}${tail} All players take +1 momentum.`);
  const spotlightUser = (result = RESULT, roll = 37) => `SPOTLIGHT VIGNETTE — begin-session.\n\n${formatMaterial(rollSpotlightSeeds({ roll, result }, scripted([1, 2, 3, 4, 5, 6, 7, 8])), { spotlight: true })}`;

  it('count 7: a spotlight the Begin card rolled is followed by its cutaway, built from that roll', () => {
    const p = setPiecesOf({
      exchanges: [exchange('a2', spotlightUser(), `A message comes.${block({ builtFrom: [{ n: 1, words: 'A message comes' }] })}`)],
      messages: [BEGIN(), msg('a2', 'A message comes.', { narrator: true, vignette: 'spotlight_begin' }), msg('a2', 'The galley.', { narrator: true, vignette: 'galley_begin' })],
    });
    expect(p.spotlights).toEqual([{ step: 'a2', result: RESULT, outcome: 'told', roll: '37', at: 'a2' }]);
  });

  it('count 7: or by the note that the narrator did not write it; else it is missing — and a card that said it was the table\'s is no promise', () => {
    const note = msg('a2', `Spotlight vignette ${RESULT} — the narrator did not write it: yours to envision.`);
    expect(setPiecesOf({ messages: [BEGIN(), note] }).spotlights[0]).toMatchObject({ outcome: 'toEnvision' });
    expect(setPiecesOf({ messages: [BEGIN(), msg('a2', 'The galley.', { narrator: true, vignette: 'galley_begin' })] }).spotlights[0])
      .toMatchObject({ outcome: 'missing', detail: 'no spotlight cutaway and no note followed' });
    // A cutaway for another roll is not this one's.
    const other = setPiecesOf({ exchanges: [exchange('a2', spotlightUser('Someone is in trouble', 12), 'Trouble.')], messages: [BEGIN(), msg('a2', 'Trouble.', { narrator: true, vignette: 'spotlight_begin' })] });
    expect(other.spotlights[0]).toMatchObject({ outcome: 'missing', detail: 'a spotlight cutaway was posted for another result' });
    expect(setPiecesOf({ messages: [BEGIN(' — yours to envision.')] }).spotlights[0]).toMatchObject({ outcome: 'theTables' });
    // The card's words carry their entities; the MATERIAL's do not.
    const quoted = 'The ship\'s AI asks a question';
    const p = setPiecesOf({
      exchanges: [exchange('a2', spotlightUser(quoted, 40), 'A question.')],
      messages: [msg('a2', `Begin a Session Spotlight vignette: The ship&#039;s AI asks a question All players take +1 momentum.`), msg('a2', 'A question.', { narrator: true, vignette: 'spotlight_begin' })],
    });
    expect(p.spotlights[0]).toMatchObject({ outcome: 'told', result: quoted, roll: '40' });
  });

  it('the scorecard has its row and its section', () => {
    const user = OPENING();
    const setPieces = setPiecesOf({
      exchanges: [exchange('a2', user, `Mira squares a debt.${block({ builtFrom: [{ n: 1, words: 'squares a debt' }] })}`)],
      messages: [BEGIN()],
    });
    const card = scorecard({ charter: { name: 'x', beats: [] }, run: { id: 'r', mode: 'rehearsal' }, setPieces });
    expect(card).toContain('| Set-pieces | 1 set-piece scene(s) (1 opening): 1 of 2 rolled results in their scene, 1 not, 0 with no fact block to say; spotlight vignettes rolled: 1 — 0 told, 0 left to envision, 0 the table\'s from the start, 1 missing |');
    expect(card).toContain('## Set-pieces — what each was built from');
    expect(card).toContain('| a2 | opening | 1 | What Mira Kestrel is doing in this lull | Bolster Debt (14, 20) | "squares a debt" |');
    expect(card).toContain('| a2 | opening | 2 | What the scene\'s eye rests on | Makeshift Container (63, 18) | not used |');
    expect(card).toContain(`| a2 | ${RESULT} | MISSING — no spotlight cutaway and no note followed |`);
    expect(scorecard({ charter: { name: 'x', beats: [] }, run: { id: 'r', mode: 'rehearsal' }, setPieces: setPiecesOf({}) })).not.toContain('Set-pieces');
  });
});

// ── a set-piece's dice, a stream of their own ────────────────────────────────

describe('a set-piece\'s dice are a stream of their own, the roller\'s draws for it included', () => {
  // Functions whose frames name the module's files, as the page's stack does
  // (V8 takes the file from `sourceURL`): a set-piece's own die, a table read
  // for it that rolls a nested row, and a price's table read.
  const at = (file, src, ...deps) => new Function(...deps.map((_, i) => `d${i}`), `${src}\n//# sourceURL=http://localhost:30000/modules/starforged-companion/src/${file}`)(...deps);
  const rollDie = at('oracles/roller.js', 'return function rollDie() { return Math.floor(Math.random() * 100) + 1; };');
  const rollOracle = at('oracles/roller.js', 'return function rollOracle() { return d0(); };', rollDie);
  const drawDie = at('session/sceneSeeds.js', 'return function drawDie() { return Math.floor(Math.random() * 100) + 1; };');
  const pairSeed = at('session/sceneSeeds.js', 'return function pairSeed() { return [d0(), d1()]; };', drawDie, rollOracle);
  const payThePrice = at('moves/payThePrice.js', 'return function payThePrice() { return d0(); };', rollOracle);

  const realRandom = Math.random;
  afterEach(() => {
    Math.random = realRandom;
    for (const k of ['__sfcDice', '__sfcRolled', '__sfcRandomKept', '__sfcRandomQueue']) delete globalThis[k];
    delete globalThis.window;
  });
  const install = () => { globalThis.window = globalThis; installDiceScript(); };

  it('keeps a table read for a set-piece with the set-piece\'s dice, and a price\'s with the roller\'s', () => {
    install();
    globalThis.__sfcRandomKept = {};
    pairSeed();
    payThePrice();
    drawDie();
    expect(Object.keys(globalThis.__sfcRandomKept).sort()).toEqual(['oracles/roller.js', 'session/sceneSeeds.js']);
    expect(globalThis.__sfcRandomKept['session/sceneSeeds.js']).toHaveLength(3);
    expect(globalThis.__sfcRandomKept['oracles/roller.js']).toHaveLength(1);
  });

  it('and hands each its own back in a replay — so a run\'s price is still its price', () => {
    install();
    globalThis.__sfcRandomKept = {};
    globalThis.__sfcRandomQueue = { 'oracles/roller.js': [0.775], 'session/sceneSeeds.js': [0.135, 0.195] };
    expect(pairSeed(), 'the set-piece takes the set-piece\'s values, its nested table read among them').toEqual([14, 20]);
    expect(payThePrice(), 'the price is the one the run recorded').toBe(78);
  });
});
