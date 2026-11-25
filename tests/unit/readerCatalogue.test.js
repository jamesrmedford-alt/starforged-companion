/**
 * STARFORGED COMPANION
 * tests/unit/readerCatalogue.test.js
 *
 * The line reader's catalogue (src/moves/readerCatalogue.js): the game's own
 * triggers, quoted, where today's two readers paraphrase them (decisions.md
 * → issue #384, D3). The fourth live long haul
 * (issue #383) found what the paraphrases cost: Develop Your Relationship
 * read as "deepen a connection", so five pleas for a tie were booked as it
 * (finding 1); a milestone offered for a claim, where the game's trigger is
 * headway made (finding 3). The quotes are held to the installed pack by a
 * Quench test (src/integration/quench.js); this holds the catalogue's shape.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { READER_CATALOGUE, CATALOGUE_MOVE_IDS, renderReaderCatalogue } from '../../src/moves/readerCatalogue.js';
import { moveTriggers } from '../../src/moves/contracts/available.js';
import { MOVES } from '../../src/schemas.js';

const ROOT = path.resolve(__dirname, '../..');
const entryOf = (id) => READER_CATALOGUE.flatMap(g => g.moves).find(m => m.id === id);
// The triggers the catalogue quotes: the move contracts' table's (slice 4 — one store, held to the pack by moveContracts.test.js).
const TRIG = moveTriggers(CATALOGUE_MOVE_IDS);

describe('the line reader\'s catalogue', () => {
  it('names every move but the session moves — none added, none dropped (the move reader\'s list, retired at the switch)', () => {
    const session = Object.keys(MOVES).filter(id => MOVES[id].category === 'session');
    expect(session.length).toBeGreaterThan(0);
    expect(new Set(CATALOGUE_MOVE_IDS)).toEqual(new Set(Object.keys(MOVES).filter(id => !session.includes(id))));
    expect(CATALOGUE_MOVE_IDS.length, 'each move once').toBe(new Set(CATALOGUE_MOVE_IDS).size);
  });

  it('quotes the game where its words decide: the seven deeds, the six kinds of headway, a new relationship or an existing one given focus', () => {
    expect(TRIG.develop_your_relationship).toMatch(/^When you reinforce your relationship with a connection by doing any of the following/);
    expect(entryOf('develop_your_relationship')).toMatchObject({
      list: ['swearing a vow to undertake a perilous quest in their service', 'completing a quest to their benefit',
        'leveraging their help in desperate circumstances', 'giving them something of worth', 'sharing a profound moment',
        'standing with them against hardship', 'overcoming a test of your relationship'],
    });
    expect(TRIG.reach_a_milestone).toMatch(/^When you make headway in your quest by doing any of the following/);
    expect(entryOf('reach_a_milestone').list).toHaveLength(6);
    expect(TRIG.make_a_connection).toMatch(/^When you search out a new relationship or give focus to an existing relationship \(not an ally or companion\), roll \+heart/);
    expect(TRIG.hearten).toMatch(/^When you socialize, share intimacy, or find a moment of peace, roll \+heart/);
    // The approaches decide the stat: Heal's four situations, each with its own.
    expect(entryOf('heal').list).toEqual(['Receive treatment from someone (not an ally): Roll +iron', 'Mend your own wounds: Roll +iron or +wits, whichever is lower',
      'Obtain treatment for a companion: Roll +heart', 'Provide care: Roll +wits']);
    // The combat moves' triggers carry their positions.
    expect(TRIG.strike).toMatch(/^When you are in control and assault a foe/);
    expect(TRIG.clash).toMatch(/^When you are in a bad spot and fight back/);
  });

  it('every quote is the game\'s trigger, never a paraphrase of the old readers\'', () => {
    for (const m of READER_CATALOGUE.flatMap(g => g.moves)) {
      expect(TRIG[m.id], m.id).toMatch(/^When (?:you|your|the) /);
      expect(MOVES[m.id], m.id).toBeTruthy();
      expect(m, `${m.id} keeps no trigger of its own: the table's is the one`).not.toHaveProperty('when');
    }
    const text = renderReaderCatalogue();
    expect(text).not.toMatch(/deepen a connection|costs the character|meets a real need|a real step toward/i);
  });

  it('a ruling sits beside its trigger, in brackets — the decided ones, in the module\'s own words', () => {
    // A favour or a risk taken is one of the quoted deeds; a plea for the tie itself is talk (issue #384, the first measure).
    expect(entryOf('develop_your_relationship').ruling).toBe('A favour that costs the giver time or standing, or bringing them what they lack, is giving them something of worth; a risk taken for them is standing with them against hardship; offering it is doing it. Asking for the relationship itself while it is being built — trust, friendship, to count on each other — is talk, no deed (rule 4). A vow sworn in their service is Swear an Iron Vow, never this in its place. No roll for a connection not yet bonded: it marks progress. Bonded, it is rolled +their rank, which the module fills in.');
    // The second measure (readers-live-20261125-073803): swear-1 read as Develop, bond-1 as talk.
    expect(entryOf('swear_an_iron_vow').ruling).toBe('A vow sworn in a connection\'s service is this, never Develop Your Relationship\'s deed in its place (that follows from the vow).');
    expect(entryOf('forge_a_bond').ruling).toMatch(/Asking to make the tie lasting — for good, whatever comes — with the track ready is this, not talk \(rule 4\)\.$/);
    expect(entryOf('fulfill_your_vow').ruling).toBe('When the line claims what the vow swore — its goal reached — as the scene bears out: this, not a milestone (rule 6).');
    expect(entryOf('reach_a_milestone').ruling).toBe('It marks the vow\'s progress with no roll. The RECENT SCENE bears the headway out (rule 6).');
    expect(entryOf('forge_a_bond').ruling).toMatch(/^A full relationship track is ready for it; less does not forbid it, at worse odds\./);
    expect(entryOf('make_a_connection').ruling).toMatch(/^Not for someone who is already the character's connection/);
    expect(entryOf('undertake_an_expedition').ruling).toBe('Any journey toward a destination that is not a charted place, even when the player says "set a course".');
    expect(READER_CATALOGUE.find(g => g.title === 'LEGACY').note).toBe('Only when the line is plainly about it.');
    expect(READER_CATALOGUE.find(g => g.title === 'FATE').note).toBe('Only when the line is plainly about it.');
    const rendered = renderReaderCatalogue();
    expect(rendered).toContain('A vow sworn in their service is Swear an Iron Vow, never this in its place. No roll for a connection not yet bonded: it marks progress. Bonded, it is rolled +their rank, which the module fills in.]');
    expect(rendered).toContain('LEGACY [Only when the line is plainly about it.]');
  });

  it('renders each move by its id, its name and how it is made, its trigger in quotes and its list after it', () => {
    const text = renderReaderCatalogue();
    expect(text).toContain('- gather_information (Gather Information): "When you search for clues, conduct an investigation, analyze evidence, or do research, roll +wits".');
    // A trigger that says its own list is quoted whole, with no list after it.
    expect(text).toMatch(/- develop_your_relationship \(Develop Your Relationship; no roll\): "When you reinforce your relationship with a connection by doing any of the following: swearing a vow[^"]*"\./);
    expect(text).toContain('- fulfill_your_vow (Fulfill Your Vow; progress roll): "When you reach the end of your quest, roll the challenge dice and compare to your progress".');
    expect(text).toContain('- face_danger (Face Danger): "When you attempt something risky or react to an imminent threat, envision your action and roll" — With speed, mobility, or agility: Roll +edge; ');
    // The same bytes every call: it is part of the cached system prompt.
    expect(renderReaderCatalogue()).toBe(text);
    for (const id of CATALOGUE_MOVE_IDS) expect(text, id).toContain(`- ${id} (`);
  });

  it('every quote is one span of text — no emphasis marker, no line break, no move link — so the drift check can find it whole', () => {
    for (const m of READER_CATALOGUE.flatMap(g => g.moves)) {
      for (const quote of [TRIG[m.id], ...(m.list ?? [])]) {
        expect(quote, m.id).not.toMatch(/__|[\r\n]|@\w+\[|<[^>]+>/);
        expect(quote.trim(), m.id).toBe(quote);
      }
    }
  });
});
