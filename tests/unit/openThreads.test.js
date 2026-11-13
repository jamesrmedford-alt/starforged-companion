/**
 * STARFORGED COMPANION
 * tests/unit/openThreads.test.js
 *
 * Issue #353 R3 / R4 — what is open at the table (src/session/openThreads.js),
 * over readVows-shaped vows with their holders:
 *   - a quest in play is an open vow besides a character's background vow —
 *     the character's first vow that is not the shared inciting vow, which is
 *     always a quest (R3, Begin a Session's check);
 *   - the vow a scene serves: a linked track's vow, the session's quest
 *     focus, or the only vow in play — a bounded ladder that never guesses
 *     (R3, the narrator's per-beat line);
 *   - the vow choices a link or a focus offers, the link a choice makes, and
 *     the Session panel's rows (R3 links, R4).
 */

import { describe, it, expect } from 'vitest';
import {
  distinctOpenVows, questVows, selectSceneVow, vowChoices, resolveVowChoice, trackVowName, openThreadRows,
} from '../../src/session/openThreads.js';

/** A readVows entry with its holder (tableVows' shape). */
const vow = (over = {}) => ({
  id: 'v1', name: 'Find the lost beacon', rank: 'formidable', ticks: 12, progress: 3,
  completed: false, forsaken: false, isBackground: false, shared: false, clock: null, vowId: null,
  actorId: 'pc-kira', actorName: 'Kira', ...over,
});

const background = (over = {}) => vow({ id: 'bg-kira', name: 'Avenge the Iron Hollow', rank: 'epic', ticks: 0, progress: 0, isBackground: true, ...over });

describe('questVows — a quest is an open vow besides a background vow (issue #353 R3)', () => {
  it('a character holding only their background vow has no quest', () => {
    expect(questVows([background()])).toEqual([]);
  });

  it('their first vow is the background vow; a later one is a quest', () => {
    const quest = vow({ id: 'v2' });
    expect(questVows([background(), quest])).toEqual([quest]);
  });

  it('the shared inciting vow is a quest — even as the only vow, and readVows labels it background', () => {
    const inciting = vow({ id: 'inc-kira', name: 'Free Dani', shared: true, isBackground: true, vowId: 'inc' });
    expect(questVows([inciting])).toEqual([inciting]);
    // Created before the character wrote their own vow: that one is the background vow.
    const own = background({ isBackground: false });
    expect(questVows([inciting, own])).toEqual([inciting]);
  });

  it('a fulfilled inciting vow leaves only the background vow — no quest', () => {
    const inciting = vow({ id: 'inc-kira', shared: true, isBackground: true, completed: true, vowId: 'inc' });
    expect(questVows([background({ isBackground: false }), inciting])).toEqual([]);
  });

  it('each character has their own background vow', () => {
    const kiraBg = background();
    const renBg  = background({ id: 'bg-ren', actorId: 'pc-ren', actorName: 'Ren', name: 'Find my brother' });
    const renQuest = vow({ id: 'v-ren', actorId: 'pc-ren', actorName: 'Ren' });
    expect(questVows([kiraBg, renBg, renQuest])).toEqual([renQuest]);
  });
});

describe('distinctOpenVows — one entry per vow, with whose it is', () => {
  it('a shared vow\'s copies are one vow, held by both; a fulfilled vow is left out', () => {
    const rows = distinctOpenVows([
      vow({ id: 'inc-kira', vowId: 'inc', name: 'Free Dani', shared: true }),
      vow({ id: 'inc-ren', vowId: 'inc', name: 'Free Dani', shared: true, actorId: 'pc-ren', actorName: 'Ren' }),
      vow({ id: 'done', name: 'Old business', completed: true }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'inc', name: 'Free Dani', holders: ['Kira', 'Ren'] });
  });
});

describe('selectSceneVow — the vow this scene serves (issue #353 R3)', () => {
  const beacon = vow({ id: 'v-beacon', vowId: 'v-beacon', name: 'Find the lost beacon' });
  const debt   = vow({ id: 'v-debt', vowId: 'v-debt', name: 'Repay the Iron Covenant', rank: 'dangerous', progress: 1 });
  const vows   = [background(), beacon, debt];

  it('a linked expedition names its vow — by id, whatever the vow is called now', () => {
    const tracks = [{ id: 't1', type: 'expedition', label: 'Into the Shroud', linkedVowId: 'v-debt', linkedVowName: 'Old name', createdAt: 1 }];
    expect(selectSceneVow({ vows, tracks })).toMatchObject({
      source: 'track', vow: { name: 'Repay the Iron Covenant' }, track: { type: 'expedition', label: 'Into the Shroud' },
    });
  });

  it('a fight linked by name (its threshold card) names the one open vow of that name', () => {
    const tracks = [{ id: 'f1', type: 'combat', label: 'Corsairs', linkedVowName: 'find the lost beacon' }];
    expect(selectSceneVow({ vows, tracks })).toMatchObject({ source: 'track', vow: { name: 'Find the lost beacon' } });
  });

  it('a fight comes first, then a scene challenge, then an expedition; the newest of a kind', () => {
    const tracks = [
      { id: 'e1', type: 'expedition', label: 'Shroud', linkedVowId: 'v-beacon', createdAt: 9 },
      { id: 's1', type: 'scene_challenge', label: 'Old standoff', linkedVowId: 'v-beacon', createdAt: 1 },
      { id: 's2', type: 'scene_challenge', label: 'The standoff', linkedVowId: 'v-debt', createdAt: 5 },
    ];
    expect(selectSceneVow({ vows, tracks })).toMatchObject({ vow: { name: 'Repay the Iron Covenant' }, track: { label: 'The standoff' } });
    tracks.push({ id: 'f1', type: 'combat', label: 'Corsairs', linkedVowId: 'v-beacon', createdAt: 0 });
    expect(selectSceneVow({ vows, tracks })).toMatchObject({ vow: { name: 'Find the lost beacon' }, track: { type: 'combat' } });
  });

  it('a track linked to a vow fulfilled since serves no scene — the focus decides, never a name guess', () => {
    const fulfilled = [background(), { ...beacon, completed: true }, debt];
    const tracks = [{ id: 'e1', type: 'expedition', label: 'Shroud', linkedVowId: 'v-beacon', linkedVowName: 'Repay the Iron Covenant' }];
    expect(selectSceneVow({ vows: fulfilled, tracks })).toMatchObject({ source: 'only', vow: { name: 'Repay the Iron Covenant' } });
  });

  it('the session\'s quest focus names the vow — exactly or as whole words — when no track is linked', () => {
    expect(selectSceneVow({ vows, focus: { quest: 'Repay the Iron Covenant' } })).toMatchObject({ source: 'focus', vow: { name: 'Repay the Iron Covenant' } });
    expect(selectSceneVow({ vows, focus: { quest: 'the lost beacon' } })).toMatchObject({ source: 'focus', vow: { name: 'Find the lost beacon' } });
  });

  it('a focus naming no vow, or two, decides nothing; with two quests in play nothing is chosen', () => {
    expect(selectSceneVow({ vows, focus: { quest: 'find out who sent the escort' } })).toBeNull();
    const two = [vow({ id: 'a', vowId: 'a', name: 'Free Dani' }), vow({ id: 'b', vowId: 'b', name: 'Avenge Dani', actorId: 'pc-ren' })];
    expect(selectSceneVow({ vows: two, focus: { quest: 'Dani' } })).toBeNull();
  });

  it('the only quest in play — a background vow beside it is not a rival', () => {
    expect(selectSceneVow({ vows: [background(), beacon] })).toMatchObject({ source: 'only', vow: { name: 'Find the lost beacon' } });
  });

  it('with no quest in play, the one open vow — the background vow — is the scene\'s', () => {
    expect(selectSceneVow({ vows: [background()] })).toMatchObject({ source: 'only', vow: { name: 'Avenge the Iron Hollow', rank: 'epic' } });
  });

  it('a shared vow on two characters is one vow; no vow at all is no line', () => {
    const shared = [
      vow({ id: 'inc-kira', vowId: 'inc', name: 'Free Dani', shared: true }),
      vow({ id: 'inc-ren', vowId: 'inc', name: 'Free Dani', shared: true, actorId: 'pc-ren', actorName: 'Ren' }),
    ];
    expect(selectSceneVow({ vows: shared })).toMatchObject({ source: 'only', vow: { name: 'Free Dani', holders: ['Kira', 'Ren'] } });
    expect(selectSceneVow({ vows: [] })).toBeNull();
  });
});

describe('vow choices and links (issue #353 R3)', () => {
  const vows = [
    background(),
    vow({ id: 'inc-kira', vowId: 'inc', name: 'Free Dani', shared: true }),
    vow({ id: 'inc-ren', vowId: 'inc', name: 'Free Dani', shared: true, actorId: 'pc-ren', actorName: 'Ren' }),
    vow({ id: 'v-ren', vowId: null, name: 'Find my brother', actorId: 'pc-ren', actorName: 'Ren' }),
    vow({ id: 'gone', vowId: 'gone', name: 'Old business', completed: true }),
  ];

  it('one choice per open vow, named with whose it is when it is not everyone\'s', () => {
    expect(vowChoices(vows)).toEqual([
      { id: 'bg-kira', name: 'Avenge the Iron Hollow', label: 'Avenge the Iron Hollow (Kira)' },
      { id: 'inc', name: 'Free Dani', label: 'Free Dani' },
      { id: 'v-ren', name: 'Find my brother', label: 'Find my brother (Ren)' },
    ]);
  });

  it('a choice links an open vow by its id across copies; a closed or unknown vow links nothing', () => {
    expect(resolveVowChoice('inc', vows)).toEqual({ linkedVowId: 'inc', linkedVowName: 'Free Dani' });
    expect(resolveVowChoice('inc-ren', vows)).toEqual({ linkedVowId: 'inc', linkedVowName: 'Free Dani' });
    expect(resolveVowChoice('v-ren', vows)).toEqual({ linkedVowId: 'v-ren', linkedVowName: 'Find my brother' });
    expect(resolveVowChoice('gone', vows)).toBeNull();
    expect(resolveVowChoice('nope', vows)).toBeNull();
    expect(resolveVowChoice('', vows)).toBeNull();
  });

  it('a track names the vow it serves as it is called now, else the name it was linked under', () => {
    expect(trackVowName({ linkedVowId: 'inc', linkedVowName: 'Rescue Dani' }, vows)).toBe('Free Dani');
    expect(trackVowName({ linkedVowName: 'Hold the line' }, vows)).toBe('Hold the line');
    expect(trackVowName({}, vows)).toBeNull();
  });
});

describe('openThreadRows — the Session panel\'s "What\'s open" (issue #353 R4)', () => {
  it('lists open vows, open tracks with the vow each serves and a scene challenge\'s danger, and running clocks', () => {
    const rows = openThreadRows({
      vows: [background(), vow({ id: 'v1', vowId: 'v1', clock: { ticks: 2, max: 6 } }), vow({ id: 'x', completed: true })],
      tracks: [
        { id: 'e1', type: 'expedition', label: 'Into the Shroud', rank: 'dangerous', ticks: 8, linkedVowId: 'v1', completed: false },
        { id: 's1', type: 'scene_challenge', label: 'The standoff', rank: 'formidable', ticks: 4, tensionClockId: 'c-paired' },
        { id: 'f1', type: 'combat', label: 'Corsairs', rank: 'dangerous', ticks: 40, completed: true },
        { id: 'jv', type: 'vow', label: 'A journal vow', rank: 'epic', ticks: 0 },
      ],
      clocks: [
        { _id: 'c-paired', name: 'The standoff', type: 'tension', segments: 4, filled: 1, active: true },
        { _id: 'c-count', name: "Archer's count", type: 'tension', segments: 6, filled: 2, active: true },
        { _id: 'c-full', name: 'The reactor', type: 'tension', segments: 4, filled: 4, active: true },
        { _id: 'c-old', name: 'Retired', type: 'campaign', segments: 6, filled: 1, active: false },
        { _id: 'c-war', name: 'The war spreads', type: 'campaign', segments: 8, filled: 3 },
      ],
    });
    expect(rows.questInPlay).toBe(true);
    expect(rows.vows).toEqual([
      { name: 'Avenge the Iron Hollow', rank: 'epic', progress: 0, clock: null, holders: ['Kira'] },
      { name: 'Find the lost beacon', rank: 'formidable', progress: 3, clock: { filled: 2, segments: 6 }, holders: ['Kira'] },
    ]);
    expect(rows.tracks).toEqual([
      { kind: 'Expedition', label: 'Into the Shroud', rank: 'dangerous', progress: 2, vowName: 'Find the lost beacon', clock: null },
      { kind: 'Scene challenge', label: 'The standoff', rank: 'formidable', progress: 1, vowName: null, clock: { filled: 1, segments: 4 } },
    ]);
    expect(rows.clocks).toEqual([
      { name: "Archer's count", type: 'tension', filled: 2, segments: 6 },
      { name: 'The war spreads', type: 'campaign', filled: 3, segments: 8 },
    ]);
  });

  it('says no quest is in play when only background vows are open', () => {
    expect(openThreadRows({ vows: [background()] }).questInPlay).toBe(false);
    expect(openThreadRows({}).questInPlay).toBe(false);
  });
});
