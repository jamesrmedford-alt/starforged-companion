/**
 * STARFORGED COMPANION
 * tests/unit/exploreOverhaul2Counts.test.js
 *
 * Overhaul 2's counts for the next live run (issue #386, design §14): what the
 * runner reads of the table (lib/table.mjs — each truth's basis and `said`,
 * the scene's anchor and let-go list, the ship's position line, what a scene's
 * end filed), the observer's scene stamp on each card, the review's counts
 * (lib/review.mjs — refrains scene by scene, scenesOf, placesOf, the
 * reconciliation sentences, colourOf, provenanceOf, openingsOf), the
 * scorecard's rows and its table against the fourth live run, and the long
 * haul's three new lines (beat 5's slip given and left, beat 17's question of
 * where the ship is, beat 22's night). The fourth live run's own sentences
 * (explorations/long-haul-live-20261124-213912, its review notes) are the
 * cases; each count has a control.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

import {
  sceneAnswerTest, scenesOf, placesOf, reconciliationsOf, colourOf, provenanceOf, openingsOf, againstRunFour,
  refrainsOf, reviewDataOf, scorecard,
} from '../../test/ci/playwright/lib/review.mjs';
import { readTable } from '../../test/ci/playwright/lib/table.mjs';
import { factHeld } from '../../test/ci/playwright/lib/ledger.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));

const narration = (step, phase, text, extra = {}) => ({ id: `m-${step}`, step, phase, narrator: true, vignette: null, card: ['narratorCard'], text, ...extra });
const line = (step, phase, text) => ({ id: `l-${step}`, step, phase, fromPlayer: true, narrator: false, card: [], text });
const table = (extra = {}) => ({
  session: { active: true, id: 's3', number: 3 }, location: { id: 'set-bleak', name: 'Bleakhold Station' },
  ship: { name: 'Kobayashi IV', position: 'Kobayashi IV docked at Bleakhold Station' },
  pcs: [{ id: 'pc', name: 'Mira Kestrel' }],
  entityCards: [{ id: 'set-bleak', name: 'Bleakhold Station', entityType: 'settlement' }, { id: 'set-hollow', name: 'Hollow Spire', entityType: 'settlement' },
    { id: 'npc-t', name: 'Tamsin Vey', entityType: 'connection' }],
  scene: { id: 'sc1', frame: null, truths: [], began: null, letGo: [] }, filed: [], helpers: {},
  ...extra,
});

describe('the @scene answers are set apart once, for the refrains and the counts alike', () => {
  it('an answer by its card or by the question its step put; a line of play is no answer', () => {
    const messages = [line('a1', 'session-3', '@scene Where is the Kobayashi IV?'), narration('a1', 'session-3', 'She is docked.'),
      narration('a2', 'session-3', 'The ring hums.', { card: ['narratorCard', 'sceneResponse'] }), narration('a3', 'session-3', 'You walk on.')];
    const isAnswer = sceneAnswerTest(messages);
    expect(messages.filter(m => m.narrator).map(isAnswer)).toEqual([true, true, false]);
  });
});

describe('scenesOf — the scenes of each session, and why each began (SCENE-TURNS-UNMEASURED)', () => {
  const marks = [
    { step: 'a1', phase: 'session-1', table: table({ scene: { id: 'sc1', truths: [], began: { sceneId: 'sc1', cause: 'session', what: 'the session begins' } } }) },
    { step: 'a2', phase: 'session-1', table: table({ scene: { id: 'sc1', truths: [], began: { sceneId: 'sc1', cause: 'session', what: 'the session begins' } } }) },
    { step: 'a3', phase: 'session-1', table: table({ scene: { id: 'sc2', truths: [], began: { sceneId: 'sc2', cause: 'place', what: 'the characters are at Bleakhold Station' } } }) },
    { step: 'a4', phase: 'session-1', table: table({ scene: { id: 'sc3', truths: [], began: { sceneId: 'sc3', cause: 'fight', what: 'a fight began' } } }) },
    { step: 'a9', phase: 'session-2', table: table({ scene: { id: 'sc4', truths: [], began: { sceneId: 'sc4', cause: 'session', what: 'the session begins' } } }) },
  ];
  const paced = { card: ['narratorCard', 'pacedNarrative'] };
  const messages = [
    narration('a1', 'session-1', 'The opening.', { vignette: 'galley_begin', sceneId: 'sc1' }),
    narration('a2', 'session-1', 'You ask around.', { sceneId: 'sc1', ...paced }),
    narration('a3', 'session-1', 'You dock.', { sceneId: 'sc2', moveId: 'set_a_course' }), narration('a3b', 'session-1', 'You walk the ring.', { sceneId: 'sc2', ...paced }),
    narration('a3c', 'session-1', 'The second clock ticks on.', { sceneId: 'sc2', card: ['narratorCard', 'clockVignetteCard'] }),   // a clock's card: no beat
    narration('a4', 'session-1', 'The cutter fires.', { moveId: 'strike' }),        // no stamp: placed by the table after its step
  ];

  it('each scene with its cause and its words, the step it began at and its beats of play — a set-piece and a clock apart', () => {
    const s = scenesOf({ marks, messages });
    expect(s.total).toBe(4);
    expect(s.sessions.map(x => [x.phase, x.scenes.map(c => `${c.cause}:${c.beats}@${c.at}`)])).toEqual([
      ['session-1', ['session:1@a1', 'place:2@a3', 'fight:1@a4']], ['session-2', ['session:0@a9']],
    ]);
    expect(s.sessions[0].scenes[1].what).toBe('the characters are at Bleakhold Station');
  });

  it('control: a run from before the anchor — scenes counted, their causes unknown', () => {
    const old = marks.map(k => ({ ...k, table: { ...k.table, scene: { id: k.table.scene.id, truths: [] } } }));
    expect(scenesOf({ marks: old, messages }).sessions[0].scenes.map(c => c.cause)).toEqual([null, null, null]);
  });
});

describe('refrains — narrations of play only, by session and now by scene too', () => {
  it('a word in a third of one scene\'s narrations is that scene\'s refrain; the @scene answers stay apart', () => {
    const say = (i, sceneId, text) => narration(`a${i}`, 'session-3', text, { sceneId });
    const messages = [
      say(1, 'sc1', 'The light blinks over the stall.'), say(2, 'sc1', 'Tamsin counts the crates.'), say(3, 'sc1', 'The light again, over the ledger.'),
      say(4, 'sc1', 'The second light comes on.'),
      say(5, 'sc2', 'The cutter closes.'), say(6, 'sc2', 'Her guns turn.'), say(7, 'sc2', 'The deck shakes.'), say(8, 'sc2', 'You hold the helm.'),
      line('a9', 'session-3', '@scene What is the light?'), narration('a9', 'session-3', 'The light is a warning lamp.', { sceneId: 'sc2' }),
    ];
    const r = refrainsOf(messages);
    const sc = r.sessions[0].scenes;
    expect(sc.map(c => `${c.sceneId}:${c.narrations}:${c.counted}`)).toEqual(['sc1:4:true', 'sc2:4:true']);
    expect(sc[0].refrains).toMatchObject([{ what: 'light', in: 3, of: 4 }]);
    expect(sc[1].refrains, 'control: a scene with no word in three of its four').toEqual([]);
    expect(r.worstScene).toMatchObject({ phase: 'session-3', sceneId: 'sc1', what: 'light', in: 3, of: 4 });
    expect(r.sessions[0].sceneAnswers, 'the answer is counted apart').toBe(1);
  });
});

describe('placesOf — the ship, the frame and the place, against what was told (SHIP-POSITION-AND-FRAME-DISAGREE)', () => {
  it('run 4\'s a65: "still off the station" while her record says docked; and a narration with her docked while the record has her near', () => {
    const marks = [
      { step: 'a65', phase: 'session-3', table: table() },
      { step: 'a66', phase: 'session-3', table: table({ ship: { name: 'Kobayashi IV', position: 'Kobayashi IV near Bleakhold Station' } }) },
      { step: 'a67', phase: 'session-3', table: table() },
    ];
    const messages = [
      narration('a65', 'session-3', 'The Kobayashi IV is still off the station, so the market is a short hop away.'),
      narration('a66', 'session-3', 'She sits docked in the clamps, quiet.'),
      narration('a67', 'session-3', 'She is docked at the ring, as she was.'),            // control: docked, and docked
    ];
    const p = placesOf({ marks, messages });
    expect(p.total).toBe(2);
    expect(p.sessions[0].contradictions.map(c => `${c.step} ${c.kind}`)).toEqual(['a65 a narration has her away', 'a66 a narration has her docked']);
    expect(p.sessions[0].contradictions[0]).toMatchObject({ record: 'Kobayashi IV docked at Bleakhold Station', quote: expect.stringContaining('still off the station') });
  });

  it('a frame naming another recorded place with no line naming it; control: the line that walked them there', () => {
    const framed = table({ scene: { id: 'sc1', truths: [], frame: { location: 'the Hollow Spire docks' } } });
    const marks = [{ step: 'a10', phase: 'session-2', table: framed }, { step: 'a11', phase: 'session-2', table: framed }];
    const messages = [
      line('a10', 'session-2', 'I look over the stalls.'), narration('a10', 'session-2', 'Stalls crowd the dock.'),
      line('a11', 'session-2', 'I take the lift down to Hollow Spire.'), narration('a11', 'session-2', 'The lift drops.'),
    ];
    const p = placesOf({ marks, messages });
    expect(p.sessions[0].contradictions).toEqual([{ step: 'a10', kind: 'the frame names another place', quote: 'the Hollow Spire docks', record: 'Bleakhold Station' }]);
  });

  it('beat 17\'s question: where the ship is, asked after the fight — kept with its answer and her record', () => {
    const marks = [{ step: 'a50', phase: 'session-2', table: table({ ship: { name: 'Kobayashi IV', position: 'Kobayashi IV near Bleakhold Station' } }) }];
    const messages = [line('a50', 'session-2', '@scene Where is the Kobayashi IV?'), narration('a50', 'session-2', 'She hangs off the lock, under way.', { card: ['narratorCard', 'sceneResponse'] })];
    const p = placesOf({ marks, messages });
    expect(p.asked).toEqual([{ step: 'a50', question: '@scene Where is the Kobayashi IV?', answer: 'She hangs off the lock, under way.', record: 'Kobayashi IV near Bleakhold Station' }]);
    expect(p.total, 'under way, and her record says near: no contradiction').toBe(0);
  });
});

describe('reconciliationsOf — the narration explaining a difference between its records (FRAME-REASONING-IN-PROSE)', () => {
  it('run 4\'s a15, a59 and a65; control: a sentence that only says where they are', () => {
    const messages = [
      narration('a15', 'session-1', "You are no longer at Tamsin's stall, so the manifest is not where you left it. Tamsin takes the folded pages."),
      narration('a59', 'session-3', 'The Kobayashi IV is docked at Bleakhold Station, though the scene frame has her off the station.'),
      narration('a65', 'session-3', 'The Kobayashi IV is still off the station, so the market is a short hop away.'),
      narration('a66', 'session-3', 'The Kobayashi IV is docked at Bleakhold Station.'),
    ];
    const r = reconciliationsOf(messages);
    expect(r.total).toBe(3);
    expect(r.sessions.map(x => [x.phase, x.sentences.map(s => s.step)])).toEqual([['session-1', ['a15']], ['session-3', ['a59', 'a65']]]);
  });
});

describe('colourOf — colour told as fact', () => {
  const truth = (id, fact, basis) => ({ id, subject: 'scene', fact, basis, said: [], narrationId: `n-${id}`, retracted: false });
  const marks = [
    { step: 'a6', phase: 'session-1', table: table({ scene: { id: 'sc1', truths: [
      truth('t1', 'a second amber light blinks on the panel', 'narrator'),
      truth('t2', 'Tamsin gave the PC a written dock-fee slip', 'narrator'),
      truth('t3', 'Mira left the cargo manifest with Tamsin for safekeeping', 'player'),
    ] } }) },
    { step: 'a90', phase: 'after-session-1', table: table({ helpers: {
      summaries: [{ session: 's1', text: 'Mira left the cargo manifest with Tamsin. The second amber light was still blinking when she went.' }],
      recap: 'Tamsin handed Mira a written dock-fee slip.',
      chronicle: [{ text: 'Mira kept her word to Tamsin.' }],
    } }) },
  ];
  const messages = [line('a7', 'session-1', 'I leave the fee slip where it is.')];

  it('run 4\'s session 1 summary\'s amber light, and the fee slip a recap tells: each a sentence holding a colour truth\'s own words', () => {
    const c = colourOf({ marks, messages });
    expect(c.colourTruths).toBe(2);
    expect(c.told.map(x => [x.where, x.fact])).toEqual([
      ['the summary of s1', 'a second amber light blinks on the panel'],
      ['the campaign recap', 'Tamsin gave the PC a written dock-fee slip'],
    ]);
    expect(c.told[1].words, 'the slip itself is the player\'s word: no evidence').not.toContain('slip');
  });

  it('control: what binds told by a helper is no colour told', () => {
    const c = colourOf({ marks, messages });
    expect(c.told.some(x => /manifest/.test(x.sentence))).toBe(false);
  });
});

describe('provenanceOf — what the facts rest on, and the tags refused', () => {
  const marks = [{ step: 'a15', phase: 'session-1', table: table({ scene: { id: 'sc1', truths: [
    { id: 't1', fact: 'holds the cargo manifest for safekeeping', basis: 'player' },
    { id: 't2', fact: 'agreed to open a ledger page with no fee', basis: 'narrator' },
    { id: 't3', fact: 'the dock lamps burn amber', basis: 'narrator' },
    { id: 't4', fact: 'agreed to hold the manifest until the next tide', basis: 'dice' },
  ] } }) }];
  const reply = (block) => ({ content: [{ type: 'text', text: `Prose.\n\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\`` }] });
  const exchanges = [
    { step: 'a15', kind: 'callNarratorAPI>narratePacedInput', response: reply({
      newTruths: [{ subject: 'Tamsin', fact: 'holds the cargo manifest for safekeeping', from: 'line' }, { subject: 'Tamsin', fact: 'agreed to open a ledger page with no fee', from: 'line' },
        { subject: 'scene', fact: 'the dock lamps burn amber' }, { subject: 'Tamsin', fact: 'a fact the ledger never held', from: 'result' }],
      stateChanges: [{ subject: 'Tamsin', attribute: 'location', value: 'her stall', from: 'line' }],
    }) },
    { step: 'a15', kind: 'callHaiku>defaultCallDetectionAPI', response: reply({ newTruths: [{ fact: 'not a narration', from: 'line' }] }) },
  ];

  it('each session\'s truths by basis; a7\'s ledger page tagged line and kept as colour is a tag refused', () => {
    const p = provenanceOf({ marks, exchanges });
    expect(p.sessions).toEqual([{ phase: 'session-1', truths: 4, byBasis: { player: 1, narrator: 2, dice: 1 } }]);
    expect(p.tags).toMatchObject({ tagged: 3, kept: 1, refused: 1, unmatched: 1, states: 1 });
    expect(p.tags.refusedFacts).toEqual([{ step: 'a15', fact: 'agreed to open a ledger page with no fee', from: 'line' }]);
  });
});

describe('openingsOf — each opening beside its WHERE block, for the cold read', () => {
  it('an opening told by the record, and one by the summary; control: a closing set-piece is none', () => {
    const exchanges = [
      { step: 'a20', kind: 'callNarratorAPI>narrateSessionVignette', user: "OPENING VIGNETTE — begin-session.\n\nWHERE THE LAST SESSION STOPPED — session 1's record, the table's facts:\n  Place: Hollow Spire.\n  What binds: the fee slip — Mira left it on Tamsin's counter (the player).\n\nITS LAST NARRATION, as the table read it — …" },
      { step: 'a40', kind: 'callNarratorAPI>narrateSessionVignette', user: 'OPENING VIGNETTE — begin-session.\n\nWHERE THE LAST SESSION STOPPED (session 2, as its summary has it):\nMira docked at Bleakhold.\n\nThe rule.' },
      { step: 'a39', kind: 'callNarratorAPI>narrateSessionVignette', user: 'CLOSING VIGNETTE — end-session.\n\nWHERE THE LAST SESSION STOPPED — none.' },
    ];
    const messages = [narration('a20', 'session-2', 'Mira wakes aboard; the slip is on Tamsin\'s counter still.', { vignette: 'galley_begin' })];
    const o = openingsOf({ exchanges, messages });
    expect(o.map(x => [x.step, x.fromRecord])).toEqual([['a20', true], ['a40', false]]);
    expect(o[0].block).toEqual(["WHERE THE LAST SESSION STOPPED — session 1's record, the table's facts:", 'Place: Hollow Spire.', "What binds: the fee slip — Mira left it on Tamsin's counter (the player)."]);
    expect(o[0].prose).toContain('the slip is on Tamsin');
  });
});

describe('the review and the scorecard carry them, with a table to read them off against run 4', () => {
  const marks = [
    { step: 'a1', phase: 'session-1', table: table({ scene: { id: 'sc1', truths: [{ id: 't1', fact: 'holds the manifest', basis: 'player' }], began: { sceneId: 'sc1', cause: 'session', what: 'the session begins' } } }) },
    { step: 'a2', phase: 'session-1', table: table({ scene: { id: 'sc2', truths: [], began: { sceneId: 'sc2', cause: 'place', what: 'the characters are at Bleakhold Station' } } }) },
  ];
  const messages = [narration('a1', 'session-1', 'You ask.', { sceneId: 'sc1' }), narration('a2', 'session-1', 'You dock, no longer at the Spire.', { sceneId: 'sc2' })];
  const { data } = reviewDataOf({ marks, messages, actions: [], prices: {}, exchanges: [] });
  const mechanics = { checks: 3, byCheck: { 'let-go-stays': { made: 2, violated: 0 }, 'scene-turned': { made: 1, violated: 0 }, 'colour-not-filed': { made: 1, violated: 0 } }, violations: [] };
  const ledger = { totals: { recalled: 5, carriedUnasked: 0, lost: 0, refused: 0, notProbed: 0, facts: 8 }, facts: [] };

  it('reviewDataOf counts each of overhaul 2\'s', () => {
    expect(data.scenes.total).toBe(2);
    expect(data.reconciliations.total).toBe(1);
    expect(data.provenance.truths).toBe(1);
    expect(Object.keys(data)).toEqual(expect.arrayContaining(['scenes', 'places', 'reconciliations', 'colour', 'provenance', 'openings']));
  });

  it('the scorecard: a row for each, and the nine counts of design §14 beside run 4\'s', () => {
    const card = scorecard({ charter: CHARTER, run: { id: 'r', mode: 'rehearsal' }, mechanics, ledger, ...data });
    for (const row of ['| Scenes |', '| One place |', '| Reconciling in prose |', '| Colour told as fact |', '| What binds |']) expect(card).toContain(row);
    expect(card).toContain("## Overhaul 2's counts, against run 4");
    const against = card.slice(card.indexOf("## Overhaul 2's counts, against run 4"));
    for (const count of ['Refrains per narration of play', 'Questions re-set on a let-go subject', 'Scenes a session, and their causes', 'Location contradictions a session',
      'Reconciliation sentences', 'Colour told as fact', 'Facts by provenance; tags refused', 'Openings against where it stopped', "The ledger's recalls"]) {
      expect(against, count).toContain(`| ${count} |`);
    }
    expect(against).toContain('| Questions re-set on a let-go subject | 0 (of 2 questions set while play had let one go) | 4 (a65, a69, a73, a85) |');
    expect(against).toContain("| The ledger's recalls | 5 recalled, 0 lost | 5 recalled, 0 lost |");
    expect(card).toContain('## Scenes');
  });

  it('control: a run scored without them has neither the rows nor the table', () => {
    const card = scorecard({ charter: CHARTER, run: { id: 'r', mode: 'live' } });
    expect(card).not.toContain("Overhaul 2's counts");
    expect(card).not.toContain('| Scenes |');
    expect(againstRunFour({}).join('\n')).toContain('| Scenes a session, and their causes | not counted |');
  });
});

describe('the table read keeps what overhaul 2 records', () => {
  const MODULE = 'starforged-companion';
  const read = (cs, actors = [], journals = []) => {
    const game = {
      settings: { get: (_m, key) => (key === 'campaignState' ? cs : undefined) },
      actors: { contents: actors, get: (id) => actors.find(a => a.id === id) },
      journal: { contents: journals }, scenes: { contents: [] },
    };
    const was = globalThis.game;
    globalThis.game = game;
    return readTable({ page: { evaluate: async (fn, arg) => fn(arg) } }).finally(() => { globalThis.game = was; });
  };

  it('each truth\'s basis and `said`, the scene\'s anchor and let-go list, and what a scene\'s end filed', async () => {
    const tavern = { id: 'npc-t', type: 'character', name: 'Tamsin Vey', items: { contents: [] }, system: {},
      flags: { [MODULE]: { entityType: 'connection', connection: { generativeTier: [
        { detail: 'keeps the ledger', source: 'scene_truth_migration', narrationId: 'n-2' }, { detail: 'smiles rarely', source: 'generative' }] } } } };
    const lore = { name: 'World Journal — Lore', pages: { contents: [{ name: 'scene: the lamps', text: { content: '' }, flags: { [MODULE]: { loreEntry: { fact: 'the lamps burn amber', narrationId: 'n-1' } } } }] }, flags: {} };
    const t = await read({
      connectionIds: [], currentSceneId: 'sc2',
      sceneTruths: [{ id: 't1', subject: 'scene', fact: 'the dock lamps burn amber', basis: 'narrator', said: ['n-3', 'n-1'], narrationId: 'n-1' }],
      sceneBegan: { sceneId: 'sc2', at: 5, cause: 'fight', what: 'a fight began', place: { id: 'set-bleak', type: 'settlement', name: 'Bleakhold Station' }, ship: { key: 'k', line: 'Kobayashi IV docked at Bleakhold Station' }, tracks: {} },
      sceneFrame: { sceneId: 'sc2', letGo: [{ text: 'What is the amber light?', stems: ['amber', 'light'] }, { text: '' }] },
    }, [tavern], [lore]);
    expect(t.scene.truths[0]).toMatchObject({ basis: 'narrator', said: ['n-3', 'n-1'] });
    expect(t.scene.began).toEqual({ sceneId: 'sc2', cause: 'fight', what: 'a fight began', place: 'Bleakhold Station', ship: 'Kobayashi IV docked at Bleakhold Station' });
    expect(t.scene.letGo).toEqual([{ text: 'What is the amber light?', stems: ['amber', 'light'] }]);
    expect(t.filed).toEqual([
      { where: 'the connection Tamsin Vey', fact: 'keeps the ledger', narrationId: 'n-2' },
      { where: 'Lore: scene: the lamps', fact: 'the lamps burn amber', narrationId: 'n-1' },
    ]);
  });

  it('control: a world from before overhaul 2 — no basis, no anchor, nothing let go, nothing filed, no position line', async () => {
    const ship = { id: 'S1', type: 'starship', name: 'Kobayashi IV', items: { contents: [] }, system: {},
      flags: { [MODULE]: { entityType: 'ship', ship: { name: 'Kobayashi IV', isCommandVehicle: true } } } };
    const t = await read({ connectionIds: [], shipIds: ['S1'], sceneTruths: [{ id: 't1', subject: 'scene', fact: 'x' }] }, [ship]);
    expect(t.scene.truths[0]).toMatchObject({ basis: null, said: [] });
    expect(t.scene.began).toBeNull();
    expect(t.scene.letGo).toEqual([]);
    expect(t.filed).toEqual([]);
    expect(t.ship.position).toBeNull();
  });

  it('a position the module\'s own line cannot be read for is no position, and says so (fail-open)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ship = { id: 'S1', type: 'starship', name: 'Kobayashi IV', items: { contents: [] }, system: {},
        flags: { [MODULE]: { entityType: 'ship', ship: { name: 'Kobayashi IV', isCommandVehicle: true, position: { nearestSettlementId: 'set-bleak' } } } } };
      const t = await read({ connectionIds: [], shipIds: ['S1'] }, [ship]);
      expect(t.ship.position).toBeNull();
      expect(warn).toHaveBeenCalledWith("explore table: the ship's position line could not be read", expect.anything());
    } finally {
      warn.mockRestore();
    }
  });
});

describe('the long haul\'s three lines for overhaul 2 (design §14)', () => {
  const beat = (id) => CHARTER.beats.find(b => b.id === id);

  it('beat 5: a slip given and then left, said first — F8, read through its refusals, never probed; the beat\'s check is as it was', () => {
    const f8 = CHARTER.facts.find(f => f.id === 'F8');
    expect(f8).toMatchObject({ kind: 'an item given and then left', statement: "Mira left the dock-fee slip Tamsin gave her on Tamsin's counter.", probes: [] });
    expect(f8.refusals[0].near).toEqual(expect.arrayContaining(['in your hand', 'on your knee']));
    const said = 'Tamsin slides a dock-fee slip across to me; I read it and leave it on her counter.';
    expect(beat('b5').tell).toContain(`(1) "${said}" (2) "I turn my sister Ilse's brass star-compass`);
    expect(factHeld(said, f8)).toBe(true);
    expect(beat('b5').check).toEqual({ type: 'factsPlanted', facts: ['F1', 'F2', 'F3', 'F4'] });
    expect(CHARTER.rehearsal.find(e => e.beat === 5)).toEqual({ beat: 5, action: 'say', text: said, plants: ['F8'], names: ['Tamsin'] });
  });

  it('beat 17: after the fight, the scene asked where the ship is, before the correction', () => {
    expect(beat('b16').tell).toMatch(/^First, as its own line, ask the narrator exactly: "@scene Where is the Kobayashi IV\?" Then: The cutter's name was wrong\./);
    expect(CHARTER.rehearsal.filter(e => e.beat === 17).map(e => e.text ?? e.template)).toEqual([
      '@scene Where is the Kobayashi IV?', '!truth list', '!truth strike $1', '!truth set "raider cutter" is named the Cinder Wren',
    ]);
  });

  it('beat 22: a line that skips time, before the recovery', () => {
    expect(beat('b21').tell).toMatch(/^Begin with a line that lets the night pass, in exactly these words: "I rest aboard until the next morning\." Then: Recover/);
    expect(CHARTER.rehearsal.filter(e => e.beat === 22)[0]).toEqual({ beat: 22, action: 'say', text: 'I rest aboard until the next morning.' });
  });

  it('the caps as the maintainer set them and every beat id as it was; the kept runs carry F8 with the rest of the scoring data', () => {
    expect(CHARTER.caps).toEqual({ actions: 400, calls: 1600, minutes: 240, usd: 15 });
    expect(CHARTER.beats.map(b => b.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b7a', 'b8', 'b9', 'b10', 'b11', 'b12', 'b13', 'b14', 'b15', 'b16', 'b17', 'b18', 'b19', 'b20', 'b21', 'b22', 'b23', 'b24', 'b25', 'b26']);
    for (const kept of fs.readdirSync(path.join(PLAYWRIGHT, 'explorations')).filter(n => n.startsWith('long-haul-'))) {
      const run = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'explorations', kept, 'replay.json'), 'utf8'));
      expect(run.charter.facts.map(f => f.id), kept).toContain('F8');
    }
  });
});
