/**
 * STARFORGED COMPANION
 * tests/unit/sceneCounts.test.js
 *
 * Issue #381, slice 0 — the measure. The session set-pieces of the kept runs,
 * counted: what an opening shares with another campaign's openings, the stock
 * words, where an opening is set and how it ends, whom a closing shows
 * (test/ci/playwright/scene-counts.mjs). No model is called: every number is
 * arithmetic over what a run recorded.
 *
 * The functions are checked on hand-made scenes, and the script on the two
 * runs the design read — its section 2.2 table, as generated rows.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  closingSubject, closingSubjects, formatCounts, openingShape, openingShapes, overlapCounts, placeWordsOf, readRuns, sceneCounts,
  scenesOfReplay, stockWords,
} from '../../test/ci/playwright/scene-counts.mjs';

const KEPT = path.resolve('test/ci/playwright/explorations');

const reply = (prose, frame = null) => ({
  content: [{ type: 'text', text: `${prose}\n\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [], ...(frame ? { sceneFrame: frame } : {}) })}\n\`\`\`` }],
});
const exchange = (step, user, prose, frame) => ({ step, kind: 'callNarratorAPI>narrateSessionVignette', user, response: reply(prose, frame) });

describe('scenesOfReplay — a run\'s set-pieces, found by their marker', () => {
  const replay = { recording: { exchanges: [
    exchange('a2', 'OPENING VIGNETTE — begin-session.\n\nActive players:', 'You stir the noodles. <npc name="Ship">Ready.</npc>', { location: 'Galley aboard the Wren', present: [], situation: 'A quiet meal' }),
    exchange('a3', 'A move was resolved.', 'You cross the deck.'),
    exchange('a9', 'CLOSING VIGNETTE — end-session.\n\nFeatured NPC (connection): Tamsin Vey. Context: a broker', 'Tamsin counts coins.'),
    exchange('a11', 'SPOTLIGHT VIGNETTE — begin-session.', 'Far off, a hatch opens.'),
    { step: 'a12', user: 'OPENING VIGNETTE — begin-session.', response: { content: [{ type: 'text', text: '```json\n{"newTruths":[]}\n```' }] } },
  ] } };

  it('keeps the openings, closings and spotlights, with their prose, their Where and their prompt', () => {
    const scenes = scenesOfReplay(replay, 'run-a');
    expect(scenes.map(s => [s.step, s.kind])).toEqual([['a2', 'opening'], ['a9', 'closing'], ['a11', 'spotlight']]);
    // The fact block and the voice markup are no part of the prose.
    expect(scenes[0].text).toBe('You stir the noodles. Ready.');
    expect(scenes[0].where).toBe('Galley aboard the Wren');
    expect(scenes[1].where).toBe('');
    expect(scenes[1].user).toMatch(/Featured NPC/);
  });

  it('a reply with no prose is no scene, and a replay with no recording has none', () => {
    expect(scenesOfReplay(replay, 'run-a').some(s => s.step === 'a12')).toBe(false);
    expect(scenesOfReplay({}, 'run-b')).toEqual([]);
  });
});

describe('overlapCounts — within a run, between runs, and the floor', () => {
  const scene = (run, step, kind, text) => ({ run, step, kind, text, where: '', user: '' });
  const runs = [
    { name: 'run-a', scenes: [
      scene('run-a', 'a2', 'opening', 'The kettle rattles beside the galley hatch while noodles soften.'),
      scene('run-a', 'a9', 'opening', 'The kettle whistles beside the galley table while lentils burn.'),
      scene('run-a', 'a8', 'closing', 'Tamsin sweeps her stall and counts yesterday\'s coins twice.'),
    ] },
    { name: 'run-b', scenes: [
      scene('run-b', 'a2', 'opening', 'The kettle rattles beside the galley hatch while noodles soften.'),
      scene('run-b', 'a8', 'closing', 'A dockhand mends a glove under the awning.'),
    ] },
  ];

  it('gives a row for each run, each pair of runs and all campaigns, by kind', () => {
    const { rows } = overlapCounts(runs);
    const row = (kind, compared) => rows.find(r => r.kind === kind && r.compared === compared);
    expect(row('opening', 'within run-a')).toMatchObject({ scenes: 2, pairs: 1 });
    // The same scene in another campaign shares every content word.
    expect(row('opening', 'run-b against run-a')).toMatchObject({ pairs: 2, highest: 1, at: 'run-b a2 against run-a a2' });
    expect(row('opening', 'across campaigns, every pair')).toMatchObject({ pairs: 2 });
    // One closing in a run is compared with nothing within it.
    expect(row('closing', 'within run-b')).toMatchObject({ pairs: 0, mean: null, highest: null });
    expect(row('closing', 'run-b against run-a').highest).toBe(0);
  });

  it('the floor is every closing against every opening', () => {
    const { floor } = overlapCounts(runs);
    expect(floor.pairs).toBe(6);
    expect(floor.highest).toBe(0);
  });

  it('each scene\'s best match is looked for in the other campaigns only', () => {
    const { best } = overlapCounts(runs);
    expect(best.find(b => b.scene === 'run-a a2')).toMatchObject({ bestMatch: 'run-b a2', share: 1 });
    expect(best.find(b => b.scene === 'run-a a9').bestMatch).toBe('run-b a2');
  });
});

describe('stockWords — the words half or more of the scenes use', () => {
  it('lists them with how many scenes use each, and counts them in each scene', () => {
    const scenes = [
      { run: 'r', step: 'a1', text: 'The intercom clears its throat by the hatch.' },
      { run: 'r', step: 'a2', text: 'A panel clears its throat. The spoon waits.' },
      { run: 'r', step: 'a3', text: 'Nothing stirs but the spoon.' },
      { run: 'r', step: 'a4', text: 'The drawer opens.' },
    ];
    const stock = stockWords(scenes);
    expect(stock.words).toEqual([{ word: 'clears', scenes: 2 }, { word: 'spoon', scenes: 2 }, { word: 'throat', scenes: 2 }]);
    expect(stock.used.map(u => u.count)).toEqual([2, 3, 1, 0]);
  });

  it('a word one scene alone uses is never stock, however few the scenes', () => {
    expect(stockWords([{ run: 'r', step: 'a1', text: 'The kettle rattles.' }]).words).toEqual([]);
  });
});

describe('the shape of an opening', () => {
  it('placeWordsOf keeps the kind of place and drops the names', () => {
    expect(placeWordsOf('Galley aboard the Kobayashi IV, near Hollow Spire')).toEqual(['galley']);
    expect(placeWordsOf('Hollow Spire docks, at Tamsin Vey\'s ledger stall')).toEqual(['hollow', 'docks', 'ledger', 'stall']);
    expect(placeWordsOf('')).toEqual([]);
  });

  it('a last sentence in which a device sounds is counted; one that only names a device is not', () => {
    const shape = (text) => openingShape({ text, where: '', user: '' });
    expect(shape('You eat. Then the comm panel by the hatch chirps once, soft and apologetic.').endsOnSignal).toBe(true);
    expect(shape('You eat. The intercom clears its throat with a burst of static.').endsOnSignal).toBe(true);
    expect(shape('You eat. You close the hatch behind you.').endsOnSignal).toBe(false);
    expect(shape('The panel chirps. You go on reading.').endsOnSignal).toBe(false);
  });

  it('a food or drink the material named is not counted against the scene', () => {
    const text = 'You pour the tea and eat an egg.';
    expect(openingShape({ text, where: '', user: 'OPENING VIGNETTE' }).food).toEqual(['tea', 'eat', 'egg']);
    const withMaterial = 'OPENING VIGNETTE\n\nMATERIAL — rolled for this scene.\n1. The thing in hand — Descriptor + Focus (4, 9): Bitter Tea\n\nEARLIER OPENINGS — already used.\n- An egg.';
    expect(openingShape({ text, where: '', user: withMaterial }).food).toEqual(['eat', 'egg']);
  });

  it('openingShapes counts a run\'s openings in its commonest place, reading the prose of one with no fact block', () => {
    const runs = [{ name: 'run-a', scenes: [
      { run: 'run-a', step: 'a2', kind: 'opening', where: 'Galley of the Wren', user: '', text: 'You wait.' },
      { run: 'run-a', step: 'a9', kind: 'opening', where: '', user: '', text: 'In the galley, a pipe knocks.' },
      { run: 'run-a', step: 'a15', kind: 'opening', where: 'Cargo bay of the Wren', user: '', text: 'You sip tea.' },
      { run: 'run-a', step: 'a8', kind: 'closing', where: 'A stall', user: '', text: 'She sweeps.' },
    ] }];
    expect(openingShapes(runs)[0]).toMatchObject({ openings: 3, place: 'galley', inThatPlace: 2, endOnSignal: 1, nameFood: 1 });
  });
});

describe('the closing\'s subject', () => {
  it('reads who a closing was told to show, and whether the table knows them', () => {
    expect(closingSubject('CLOSING VIGNETTE\n\nFeatured NPC (bonded_connection): Tamsin Okoro. Context: Role: Explorer')).toEqual({ name: 'Tamsin Okoro', kind: 'bonded_connection', named: true });
    expect(closingSubject('Featured NPC (sector_trouble): the architect of Cinder Expanse. Context: Pirates raid the lanes')).toMatchObject({ named: false });
    expect(closingSubject('Featured NPC: a familiar adversary you can\'t quite name.')).toMatchObject({ kind: 'fallback', named: false });
    expect(closingSubject('Subject (settlement): Bleakhold Station.')).toEqual({ name: 'Bleakhold Station', kind: 'settlement', named: true });
    expect(closingSubject('CLOSING VIGNETTE')).toBeNull();
  });

  it('counts the unnamed, and the closings that show whom the one before showed — a renamed person is the same person', () => {
    const closing = (step, line) => ({ run: 'run-a', step, kind: 'closing', where: '', text: 'She waits.', user: `CLOSING VIGNETTE\n\n${line}` });
    const runs = [{ name: 'run-a', scenes: [
      closing('a13', 'Featured NPC (connection): Tamsin Vey. Context: a broker'),
      closing('a39', 'Featured NPC (connection): Tamsin Okoro. Context: a broker'),
      closing('a87', 'Featured NPC (threat): The Ashen Wake. Context: raiders'),
    ] }];
    expect(closingSubjects(runs)[0]).toMatchObject({ closings: 3, unnamed: 0, sameAsLast: 1, ofLater: 2 });
  });
});

describe('the kept runs — the design\'s table, as generated rows', () => {
  const folders = ['long-haul-live-20261123-1459', 'long-haul-live-20261124-0321'].map(d => path.join(KEPT, d));
  const kept = folders.every(f => fs.existsSync(path.join(f, 'replay.json')));

  it.skipIf(!kept)('the long haul\'s second and third live runs give issue #381\'s numbers', () => {
    const runs = readRuns(folders);
    expect(runs.map(r => r.name)).toEqual(['long-haul-live-20261123-1459', 'long-haul-live-20261124-0321']);
    const counts = sceneCounts(runs);
    expect(counts.runs.map(r => [r.openings, r.closings])).toEqual([[4, 3], [4, 3]]);

    const row = (kind, compared) => counts.overlap.rows.find(r => r.kind === kind && r.compared === compared);
    const shares = (r) => [Math.round(r.mean * 1000) / 10, Math.round(r.highest * 100)];
    expect(shares(row('opening', 'within long-haul-live-20261123-1459'))).toEqual([14.1, 24]);
    expect(shares(row('opening', 'within long-haul-live-20261124-0321'))).toEqual([15.9, 21]);
    expect(shares(row('opening', 'long-haul-live-20261124-0321 against long-haul-live-20261123-1459'))).toEqual([14.7, 25]);
    expect(shares(row('closing', 'within long-haul-live-20261123-1459'))).toEqual([9.1, 14]);
    expect(shares(row('closing', 'within long-haul-live-20261124-0321'))).toEqual([16.5, 23]);
    expect(shares(row('closing', 'long-haul-live-20261124-0321 against long-haul-live-20261123-1459'))).toEqual([9.4, 29]);
    expect(shares(counts.overlap.floor)).toEqual([7.6, 17]);

    // The stock: "throat" in five of the eight openings, the galley in seven,
    // a device or the ship sounding at the end of all eight, a food in all eight.
    expect(counts.stock.opening.words.find(w => w.word === 'throat')).toEqual({ word: 'throat', scenes: 5 });
    expect(counts.openings.map(o => [o.place, o.inThatPlace, o.endOnSignal, o.nameFood])).toEqual([['galley', 3, 4, 4], ['galley', 4, 4, 4]]);
    // The closings: one person three times running, then nobody the table knows, three times.
    expect(counts.closings.map(c => [c.unnamed, c.sameAsLast, c.ofLater])).toEqual([[0, 2, 2], [3, 2, 2]]);
  });

  it.skipIf(!kept)('the page of tables names every count', () => {
    const page = formatCounts(sceneCounts(readRuns(folders)));
    for (const heading of ['## Content words in common', '## Each scene\'s best match in another campaign', '## Stock words — openings (8 scenes)',
      '## The shape of an opening', '## The closing\'s subject']) expect(page).toContain(heading);
    expect(page).toMatch(/\| floor \| an opening against a closing, any pair \| 48 \| 7\.6% \| 17\.4% \|/);
  });

  it('a folder with no replay is left out', () => {
    expect(readRuns([path.join(KEPT, 'no-such-run')])).toEqual([]);
  });
});
