/**
 * STARFORGED COMPANION
 * tests/unit/relevanceUnicodeNames.test.js
 *
 * Issue #322 V19 (the audit's relevanceUnicodeNames probe,
 * RELEVANCE-UNICODE-BOUNDARY): matchNamesInNarration built
 * `new RegExp(`\\b${token}\\b`, "i")` without the `u` flag, and JS `\b`
 * is an ASCII word boundary — so a name whose first or last character is a
 * non-ASCII letter had no boundary beside a space or the string's end: "Zoë",
 * "José", "Renée", "Élise" never matched on any relevance path, the NPC got
 * no ENTITIES IN SCENE card and their ledger facts dropped out of scope. The
 * same held for inputNamesOtherPlayerCharacter (narrator.js). Both use a
 * Unicode-aware whole-word pattern now (wholeWordPattern).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { buildNameIndex, matchNamesInNarration, resolveRelevance, wholeWordPattern } from '../../src/context/relevanceResolver.js';
import { inputNamesOtherPlayerCharacter } from '../../src/narration/narrator.js';

const roster = [
  { _id: 'r1', journalId: 'a-zoe',   name: 'Zoë',        entityType: 'connection' },
  { _id: 'r2', journalId: 'a-jose',  name: 'José Ruiz',  entityType: 'connection' },
  { _id: 'r3', journalId: 'a-elise', name: 'Élise Varga', entityType: 'connection' },
];

describe('relevance — names that start or end with a non-ASCII letter', () => {
  it('matches a one-word name ending in ë ("Zoë")', () => {
    const { entities } = matchNamesInNarration('I ask Zoë about the cargo.', buildNameIndex(roster));
    expect(entities.map(e => e.journalId)).toContain('a-zoe');
  });

  it('matches a first name ending in é ("José") and a name starting with É ("Élise")', () => {
    const index = buildNameIndex(roster);
    expect(matchNamesInNarration('José waves me over.', index).entities.map(e => e.journalId)).toContain('a-jose');
    expect(matchNamesInNarration('I hail Élise on the comm.', index).entities.map(e => e.journalId)).toContain('a-elise');
  });

  it('the lexical (paced / @scene) relevance path finds the NPC the player named', async () => {
    const result = await resolveRelevance('I ask Zoë about the cargo.', null, null, {}, {
      collectEntities: async () => roster,
    });
    expect(result.entityIds).toContain('a-zoe');
  });

  it("a player's line naming another PC is seen when that PC's name ends in a non-ASCII letter", () => {
    const pcs = [{ name: 'Renée Okafor' }, { name: 'Kira Voss' }];
    expect(inputNamesOtherPlayerCharacter('I hand Renée the scanner.', 'Kira Voss', pcs)).toBe(true);
    expect(inputNamesOtherPlayerCharacter('I hand the scanner over.', 'Kira Voss', pcs)).toBe(false);
  });

  it("the pattern is still a whole word: a name inside a longer word is no match", () => {
    expect(wholeWordPattern('zoë').test('i ask zoë about it')).toBe(true);
    expect(wholeWordPattern('zoë').test('zoë.')).toBe(true);
    expect(wholeWordPattern('zoë').test('zoëtrope')).toBe(false);
    expect(wholeWordPattern('ren').test('renée waves')).toBe(false);
    expect(wholeWordPattern('kira').test("kira's blade")).toBe(true);
    expect(wholeWordPattern('a.b').test('axb')).toBe(false);    // escaped
  });
});
