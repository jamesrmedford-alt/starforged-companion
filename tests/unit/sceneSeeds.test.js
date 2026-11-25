/**
 * STARFORGED COMPANION
 * tests/unit/sceneSeeds.test.js
 *
 * Issue #381 — a session set-piece is built from material rolled on the
 * game's oracles (src/session/sceneSeeds.js). The long haul's two live
 * campaigns were separate worlds, and their openings were one scene: the
 * galley in seven of eight, a food in all eight, a last sentence in which a
 * device or the ship sounds in all eight. Each was a slot an instruction left
 * open. The slot is filled by dice now, and this file pins the dice:
 *
 *   - what the opening rolls, on which registered tables, in what order —
 *     the playtest runner replays the draws as a stream of their own, so the
 *     order is a contract;
 *   - that every die comes through one function, the file's only caller of
 *     Math.random;
 *   - a table with no fitting result: an instruction row is drawn again, a
 *     second result is drawn with the first, a roll that fails leaves its
 *     seed out;
 *   - the MATERIAL block the narrator is given, the account it gives back
 *     ("builtFrom") checked against its prose, and "Rolled for this scene" as
 *     the table reads it.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';

import {
  drawDie, rollOpeningSeeds, formatMaterial, markSeedsUsed, seedsForFlags, renderSeedsLine, renderSceneRolls,
} from '../../src/session/sceneSeeds.js';
import { ORACLE_TABLES, rollOracle } from '../../src/oracles/roller.js';
import { parseHTML } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';

/** A draw that hands out `faces` in order, and records what was asked for. */
function scripted(faces) {
  const queue = [...faces];
  const asked = [];
  const draw = (sides) => {
    asked.push(sides);
    if (!queue.length) throw new Error('the script ran out of dice');
    return queue.shift();
  };
  return Object.assign(draw, { asked, left: () => queue.length });
}

afterEach(() => vi.restoreAllMocks());

describe('the one draw site', () => {
  it('drawDie gives 1..faces from Math.random, a d100 unless told otherwise', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.999).mockReturnValueOnce(0.135).mockReturnValueOnce(0.5);
    expect(drawDie()).toBe(1);
    expect(drawDie()).toBe(100);
    expect(drawDie(100)).toBe(14);
    expect(drawDie(7)).toBe(4);
  });

  it('it is the file\'s only caller of Math.random — the runner keeps a scene\'s rolls as their own stream by it', () => {
    const source = fs.readFileSync('src/session/sceneSeeds.js', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(source.match(/Math\.random/g)).toHaveLength(1);
    expect(source).toMatch(/export function drawDie\(faces = 100\) \{\s*return Math\.floor\(Math\.random\(\) \* faces\) \+ 1;/);
  });

  it('a recipe handed its draw reads no other randomness: the tables it rolls send no roll elsewhere', () => {
    const random = vi.spyOn(Math, 'random');
    rollOpeningSeeds({ present: ['Mira'], absent: ['Dree'], placeKnown: false }, scripted([14, 20, 5, 6, 63, 18, 7, 8, 40, 12, 70, 30, 1, 2, 3, 4]));
    expect(random).not.toHaveBeenCalled();
    // The reason: 100 single rows each, and no row that is a reference or a "roll twice".
    for (const id of ['action', 'theme', 'descriptor', 'focus']) {
      const table = ORACLE_TABLES[id].table;
      expect(table).toHaveLength(100);
      expect(table.some(row => row.ref || /^Roll /i.test(row.result))).toBe(false);
    }
  });
});

describe('the opening\'s material', () => {
  it('rolls what the characters are doing and what the eye rests on — each with a second result — in that order', () => {
    const draw = scripted([14, 20, 5, 6, 63, 18, 7, 8]);
    const seeds = rollOpeningSeeds({ present: ['Mira Kestrel'], placeKnown: true }, draw);

    expect(draw.asked).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(draw.left()).toBe(0);
    expect(seeds.map(s => s.slot)).toEqual(['moment', 'eye']);

    const [moment, eye] = seeds;
    expect(moment).toMatchObject({
      label: 'What Mira Kestrel is doing in this lull', from: 'oracle', result: 'Bolster Debt', used: null,
      tables: [{ id: 'action', name: 'Action', roll: 14, result: 'Bolster' }, { id: 'theme', name: 'Theme', roll: 20, result: 'Debt' }],
    });
    // The second result is the registered tables' own rows 5 and 6.
    expect(moment.second.result).toBe(`${rollOracle('action', { roll: 5 }).result} ${rollOracle('theme', { roll: 6 }).result}`);
    expect(moment.second.tables.map(t => t.roll)).toEqual([5, 6]);
    expect(eye).toMatchObject({ label: 'What the scene\'s eye rests on', result: 'Makeshift Container' });
    expect(eye.tables.map(t => [t.id, t.roll])).toEqual([['descriptor', 63], ['focus', 18]]);
    expect(eye.second.result).toBe(`${rollOracle('descriptor', { roll: 7 }).result} ${rollOracle('focus', { roll: 8 }).result}`);
  });

  it('several characters share the moment', () => {
    const seeds = rollOpeningSeeds({ present: ['Kira', 'Ren'], placeKnown: true }, scripted([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(seeds[0].label).toBe('What they are doing in this lull');
  });

  it('a place aboard is rolled only when nothing says where the scene is set — and the galley is one row of it', () => {
    // Zone 40 is Living (31–55); Living area 12 is "Galley or kitchen" (9–16).
    const draw = scripted([14, 20, 5, 6, 63, 18, 7, 8, 40, 12, 70, 30]);
    const seeds = rollOpeningSeeds({ present: ['Mira'], placeKnown: false }, draw);
    expect(seeds.map(s => s.slot)).toEqual(['moment', 'eye', 'place']);
    const place = seeds[2];
    expect(place).toMatchObject({ label: 'Where aboard the ship this is', result: 'Galley or kitchen (Living)', source: 'Ship zone + area' });
    expect(place.tables.map(t => [t.id, t.roll, t.result])).toEqual([
      ['derelict_zone_starship', 40, 'Living'], ['derelict_area_living', 12, 'Galley or kitchen'],
    ]);
    // Its second result: zone 70 is Operations, that zone's area 30.
    expect(place.second.tables.map(t => t.id)).toEqual(['derelict_zone_starship', 'derelict_area_operations']);
    expect(place.second.result).toBe(`${rollOracle('derelict_area_operations', { roll: 30 }).result} (Operations)`);

    expect(rollOpeningSeeds({ present: ['Mira'], placeKnown: true }, scripted([1, 2, 3, 4, 5, 6, 7, 8])).some(s => s.slot === 'place')).toBe(false);
  });

  it('an area row that is an instruction ("New zone") is no place: it is drawn again', () => {
    // Living area 90 is "New zone via Access": zone and area are drawn again.
    const draw = scripted([14, 20, 5, 6, 63, 18, 7, 8, 40, 90, 10, 20, 70, 30]);
    const place = rollOpeningSeeds({ present: ['Mira'], placeKnown: false }, draw).find(s => s.slot === 'place');
    expect(place.tables.map(t => [t.id, t.roll])).toEqual([['derelict_zone_starship', 10], ['derelict_area_engineering', 20]]);
    expect(place.result).not.toMatch(/New zone/);
    expect(draw.left()).toBe(0);
  });

  it('…up to three times, and then the scene has no rolled place', () => {
    // Four instruction rows running: the place is left out, the rest stands.
    const draw = scripted([14, 20, 5, 6, 63, 18, 7, 8, 40, 90, 40, 85, 10, 99, 95, 81]);
    const seeds = rollOpeningSeeds({ present: ['Mira'], placeKnown: false }, draw);
    expect(seeds.map(s => s.slot)).toEqual(['moment', 'eye']);
    expect(draw.left()).toBe(0);
  });

  it('a place whose second draw is all instructions keeps its result and has no second', () => {
    const draw = scripted([14, 20, 5, 6, 63, 18, 7, 8, 40, 12, 40, 90, 40, 90, 40, 90, 40, 90]);
    const place = rollOpeningSeeds({ present: ['Mira'], placeKnown: false }, draw).find(s => s.slot === 'place');
    expect(place.result).toBe('Galley or kitchen (Living)');
    expect(place.second).toBeUndefined();
  });

  it('each absent crewmate\'s business is rolled, three at most', () => {
    const dice = Array.from({ length: 8 + 4 * 3 }, (_, i) => i + 1);
    const draw = scripted(dice);
    const seeds = rollOpeningSeeds({ present: ['Kira'], absent: ['Ren', 'Dree', 'Oso', 'Vash'], placeKnown: true }, draw);
    expect(seeds.filter(s => s.slot === 'absent').map(s => s.label)).toEqual([
      'What Ren is up to, elsewhere', 'What Dree is up to, elsewhere', 'What Oso is up to, elsewhere',
    ]);
    expect(seeds[2].tables.map(t => t.id)).toEqual(['action', 'theme']);
    expect(draw.left()).toBe(0);
  });

  it('a roll that fails leaves its seed out, and the scene is built from the ones that were made', () => {
    // The script runs out during the second seed: it throws there.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seeds = rollOpeningSeeds({ present: ['Mira'], placeKnown: true }, scripted([14, 20, 5, 6, 63]));
    expect(seeds.map(s => s.slot)).toEqual(['moment']);
    expect(warn).toHaveBeenCalled();
    // With none made, there is no material at all.
    expect(rollOpeningSeeds({ present: ['Mira'], placeKnown: true }, scripted([]))).toEqual([]);
    expect(formatMaterial([])).toBe('');
  });
});

describe('MATERIAL — what the narrator is given', () => {
  const seeds = () => rollOpeningSeeds({ present: ['Mira'], placeKnown: false }, scripted([14, 20, 5, 6, 63, 18, 7, 8, 40, 12, 70, 30]));

  it('numbers each result with its tables and dice, and puts the second under it', () => {
    const block = formatMaterial(seeds());
    expect(block.split('\n')[0]).toBe('MATERIAL — rolled for this scene on the game\'s oracles. Build the scene from it.');
    expect(block).toContain('1. What Mira is doing in this lull — Action + Theme (14, 20): Bolster Debt');
    expect(block).toMatch(/1\. [^\n]*\n {5}\(if that cannot be true here: [A-Z][a-z]+ [A-Z][^\n]*\)/);
    expect(block).toContain('2. What the scene\'s eye rests on — Descriptor + Focus (63, 18): Makeshift Container');
    // A ship's rooms are told as a ship's, never as a derelict's.
    expect(block).toContain('3. Where aboard the ship this is — Ship zone + area (40, 12): Galley or kitchen (Living)');
    expect(block).not.toMatch(/Derelict/);
  });

  it('says each result is in the scene, read as an oracle is read, and that the scene has no business of its own', () => {
    const block = formatMaterial(seeds());
    expect(block).toMatch(/Each numbered result is in the scene, recognisably\./);
    expect(block).toMatch(/for what the words mean here, at the size of a quiet moment/);
    expect(block).toMatch(/a small trouble\), and never a turn of the plot\./);
    // Never written as rolled (known-issues SET-PIECES-SHAPED-BY-THEIR-PROMPT).
    expect(block).toMatch(/A result's words are the oracle's, never the prose's: no word of a result is\s+written as it was rolled\./);
    expect(block).toMatch(/The scene has no business and no featured thing of its own\./);
    expect(block).toMatch(/Nothing is\s+eaten, drunk, mended, heard or noticed in it that is not one of the results\s+or already on record\./);
    expect(block).toMatch(/gives way to the one in brackets under it — once/);
  });

  it('asks for the account in the fact block — and not when no fact block is written', () => {
    expect(formatMaterial(seeds())).toMatch(/In your JSON block, add "builtFrom": one entry for each number/);
    expect(formatMaterial(seeds(), { account: false })).not.toMatch(/builtFrom|JSON block/);
  });
});

describe('builtFrom — the narration\'s account, checked against its prose', () => {
  const PROSE = 'Mira counts the debts on her fingers, twice. On the shelf sits a jar with a taped lid, and she does not look at it.';
  const seeds = () => rollOpeningSeeds({ present: ['Mira'], placeKnown: true }, scripted([14, 20, 5, 6, 63, 18, 7, 8]));

  it('a seed whose words are in the prose is marked used with them', () => {
    const list = seeds();
    markSeedsUsed(list, [{ n: 1, words: 'counts the debts on her fingers', second: false }, { n: 2, words: 'a jar with a taped lid', second: false }], PROSE);
    expect(list.map(s => s.used)).toEqual(['counts the debts on her fingers', 'a jar with a taped lid']);
    expect(list.every(s => s.tookSecond === false && s.claimed === undefined)).toBe(true);
  });

  it('the words are found whatever their case, punctuation or voice markup', () => {
    const list = seeds();
    markSeedsUsed(list, [{ n: 1, words: 'Counts the debts — on her fingers', second: false }, { n: 2, words: 'jar with a "taped" lid,', second: false }],
      'Mira <npc name="Mira">counts the debts</npc> on her fingers. A jar with a taped lid.');
    expect(list.map(s => typeof s.used)).toEqual(['string', 'string']);
  });

  it('words the prose does not hold are a claim, not a use', () => {
    const list = seeds();
    markSeedsUsed(list, [{ n: 1, words: 'pays off an old favour', second: false }], PROSE);
    expect(list[0]).toMatchObject({ used: false, claimed: 'pays off an old favour' });
    // No entry at all: not used, nothing claimed.
    expect(list[1].used).toBe(false);
    expect(list[1].claimed).toBeUndefined();
  });

  it('a second result taken is marked — only on a seed that has one', () => {
    const list = seeds();
    list.push({ slot: 'subject', label: 'Who it shows', from: 'state', tables: [], result: 'Tamsin Vey', used: null });
    markSeedsUsed(list, [
      { n: 1, words: 'counts the debts on her fingers', second: true },
      { n: 3, words: 'she does not look at it', second: true },
    ], PROSE);
    expect(list[0].tookSecond).toBe(true);
    expect(list[2]).toMatchObject({ used: 'she does not look at it', tookSecond: false });
  });

  it('with no fact block read there is no account: the seeds are left as they were', () => {
    const list = seeds();
    expect(markSeedsUsed(list, null, PROSE)).toBe(list);
    expect(list.map(s => s.used)).toEqual([null, null]);
    expect(markSeedsUsed(null, [], PROSE)).toBeNull();
  });

  it('an entry for a number the scene has no seed for is ignored', () => {
    const list = seeds();
    markSeedsUsed(list, [{ n: 9, words: 'a jar with a taped lid', second: false }], PROSE);
    expect(list.map(s => s.used)).toEqual([false, false]);
  });

  it('a number names the seed the MATERIAL block gave it: one with no result is not counted by either', () => {
    const [moment, eye] = seeds();
    const list = [moment, { slot: 'place', label: 'Where aboard the ship this is', result: '' }, eye];
    const block = formatMaterial(list);
    expect(block).toContain('2. What the scene\'s eye rests on');
    expect(block).not.toMatch(/^3\./m);
    markSeedsUsed(list, [{ n: 2, words: 'a jar with a taped lid', second: false }], PROSE);
    expect(eye.used).toBe('a jar with a taped lid');
    expect(moment.used).toBe(false);
    expect(list[1].used).toBeUndefined();
  });
});

describe('"Rolled for this scene" — the table reads the dice', () => {
  const marked = () => {
    const list = rollOpeningSeeds({ present: ['Mira'], placeKnown: false }, scripted([14, 20, 5, 6, 63, 18, 7, 8, 40, 12, 70, 30]));
    markSeedsUsed(list, [{ n: 1, words: 'counts the debts', second: false }, { n: 3, words: 'the forward lockers', second: true }], 'Mira counts the debts by the forward lockers.');
    return list;
  };

  it('seedsForFlags keeps each seed as plain data, with its account', () => {
    const flags = seedsForFlags(marked());
    expect(JSON.parse(JSON.stringify(flags))).toEqual(flags);
    expect(flags.map(s => [s.slot, s.result, s.used, !!s.tookSecond])).toEqual([
      ['moment', 'Bolster Debt', 'counts the debts', false],
      ['eye', 'Makeshift Container', false, false],
      ['place', 'Galley or kitchen (Living)', 'the forward lockers', true],
    ]);
    expect(flags[0].tables).toEqual([{ id: 'action', name: 'Action', roll: 14, result: 'Bolster' }, { id: 'theme', name: 'Theme', roll: 20, result: 'Debt' }]);
    expect(flags[0].second.tables.map(t => t.roll)).toEqual([5, 6]);
    expect(seedsForFlags(null)).toEqual([]);
    expect(seedsForFlags([null, {}, { result: '' }])).toEqual([]);
  });

  it('the line is closed, and shows each seed with its tables, dice and result', () => {
    const html = renderSeedsLine(seedsForFlags(marked()));
    expect(html).toMatch(/^<details class="sf-scene-rolls"><summary>Rolled for this scene<\/summary><ul>/);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain('What Mira is doing in this lull — Action + Theme (14, 20): <strong>Bolster Debt</strong>');
    // The table is shown the real tables' names.
    expect(html).toContain('Derelict Zone (Starship) + Derelict Living Area (40, 12): <strong>Galley or kitchen (Living)</strong>');
  });

  it('a seed the narration did not account for says "not used"; a second result taken is shown', () => {
    const html = renderSeedsLine(seedsForFlags(marked()));
    expect(html).toMatch(/Makeshift Container<\/strong> <span class="sf-scene-roll-unused">— not used<\/span>/);
    expect(html).toMatch(/set aside for its second result: <strong>[^<]+ \(Operations\)<\/strong> \(70, 30\)/);
    expect(html).toContain('— “counts the debts”');
  });

  it('with no account read, nothing is said of use', () => {
    const list = rollOpeningSeeds({ present: ['Mira'], placeKnown: true }, scripted([14, 20, 5, 6, 63, 18, 7, 8]));
    expect(renderSeedsLine(seedsForFlags(list))).not.toMatch(/not used|sf-scene-roll-used/);
  });

  it('what a card holds is escaped', () => {
    const html = renderSeedsLine([{ label: '<b>x</b>', tables: [{ name: 'A&B', roll: 1, result: 'r' }], result: '<script>', used: '"q"' }]);
    expect(html).not.toMatch(/<b>|<script>/);
    expect(html).toContain('&lt;script&gt;');
  });

  it('renderSceneRolls puts the line under the card\'s prose, from its flag, once', () => {
    const message = { flags: { [MODULE_ID]: { sessionVignetteCard: true, builtFrom: seedsForFlags(marked()) } } };
    const root = parseHTML('<div class="message-content"><div class="sf-session-vignette-card"><strong>Opening</strong>'
      + '<p class="sf-narration-prose">Mira counts the debts.</p><div class="sf-narration-footer"></div></div></div>', { tag: 'li' });
    renderSceneRolls(message, root);
    renderSceneRolls(message, root);
    expect(root.querySelectorAll('.sf-scene-rolls')).toHaveLength(1);
    const card = root.querySelector('.sf-session-vignette-card');
    expect(card.children.map(c => c.className)).toEqual(['', 'sf-narration-prose', 'sf-scene-rolls', 'sf-narration-footer']);
    expect(root.querySelector('.sf-scene-rolls').textContent).toContain('Rolled for this scene');
  });

  it('a card with no rolls, or no set-piece card, gets nothing', () => {
    const root = () => parseHTML('<div class="sf-session-vignette-card"><p class="sf-narration-prose">x</p></div>', { tag: 'li' });
    const bare = root();
    renderSceneRolls({ flags: { [MODULE_ID]: { sessionVignetteCard: true } } }, bare);
    expect(bare.querySelectorAll('.sf-scene-rolls')).toHaveLength(0);
    const other = parseHTML('<div class="sf-narration-card"><p>x</p></div>', { tag: 'li' });
    renderSceneRolls({ flags: { [MODULE_ID]: { builtFrom: seedsForFlags(marked()) } } }, other);
    expect(other.querySelectorAll('.sf-scene-rolls')).toHaveLength(0);
  });
});
