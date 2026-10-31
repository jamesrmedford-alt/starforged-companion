// tests/probes/narration/relevanceUnicodeNames.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// RELEVANCE-UNICODE-BOUNDARY: matchNamesInNarration (src/context/relevanceResolver.js)
// builds `new RegExp(`\\b${token}\\b`, "i")` without the `u` flag. JS `\b` is an
// ASCII word boundary, so a token whose first or last character is a non-ASCII
// letter has no boundary next to a space or the string's end: "Zoë", "José",
// "Renée", "Élise" never match, on every path (move relevance, paced / @scene
// lexical relevance, the consistency check's context, the tier pass). The NPC
// gets no ENTITIES IN SCENE card and their entity-keyed ledger facts drop out
// of scope.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { buildNameIndex, matchNamesInNarration, resolveRelevance } from '../../../src/context/relevanceResolver.js';

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
});
