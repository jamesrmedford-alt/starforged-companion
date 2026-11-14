/**
 * STARFORGED COMPANION
 * tests/unit/nameMatch.test.js
 *
 * Issue #354 P2-16 / P2-17 / P2-18 / P2-30 — one thing under more than one
 * name (src/entities/nameMatch.js, pure). The alpha 23 playtest's names:
 * "Archer", "Ms Archer" and "Valdur Archer" for Vuldar Archer; "blockade
 * corridor" for the location "the corridor"; a threat recorded again as
 * "<name>: imminent detection: high"; "the corridor" beside "The Escort".
 */

import { describe, it, expect } from 'vitest';
import {
  nameWords, misspelledWord, personNameMatch, nameWithin, nameKey, suffixedName, sameSubject, generatedName, loreTitle,
} from '../../src/entities/nameMatch.js';

describe('personNameMatch — a person under part of their name or a near spelling', () => {
  it('a single word that is the first or last name is that person', () => {
    expect(personNameMatch('Archer', 'Vuldar Archer')).toBe('part');
    expect(personNameMatch('Vuldar', 'Vuldar Archer')).toBe('part');
    expect(personNameMatch('vuldar archer', 'Archer')).toBe('part');
    expect(personNameMatch('Isaac', 'Isaac Sutton')).toBe('part');
  });

  it('a near spelling of the name is that person', () => {
    expect(personNameMatch('Valdur Archer', 'Vuldar Archer')).toBe('spelling');
    expect(personNameMatch('Suton', 'Isaac Sutton')).toBe('part');
  });

  it('the same name, an article or case aside', () => {
    expect(personNameMatch('the escort', 'The Escort')).toBe('same');
  });

  it('two people who share a surname, or whose short names differ by a letter, stay two people', () => {
    expect(personNameMatch('Mara Archer', 'Vuldar Archer')).toBeNull();
    expect(personNameMatch('Maren', 'Marek')).toBeNull();
    expect(personNameMatch('Kira', 'Kora')).toBeNull();
    expect(personNameMatch('Vance', 'Advance')).toBeNull();
    expect(personNameMatch('', 'Vuldar Archer')).toBeNull();
  });

  it('a middle word is no name to be called by', () => {
    expect(personNameMatch('Reyes', 'Ana Reyes Okafor')).toBeNull();
  });
});

describe('misspelledWord — narrow on purpose', () => {
  it('the same consonants in order, five letters or more, two letters apart at most', () => {
    expect(misspelledWord('valdur', 'vuldar')).toBe(true);
    expect(misspelledWord('sutton', 'suton')).toBe(true);
    expect(misspelledWord('maren', 'marek')).toBe(false);
    expect(misspelledWord('kira', 'kora')).toBe(false);
    expect(misspelledWord('archer', 'archer')).toBe(false);
  });
});

describe('nameWithin — a place under part of its name', () => {
  it('one name inside the other as whole words, articles aside, either way round', () => {
    expect(nameWithin('blockade corridor', 'the corridor')).toBe(true);
    expect(nameWithin('The Corridor', 'blockade corridor')).toBe(true);
    expect(nameWithin('Bleakhold', 'Bleakhold Station')).toBe(true);
  });

  it('never a word inside a word', () => {
    expect(nameWithin('hold', 'Bleakhold')).toBe(false);
    expect(nameWithin('', 'Bleakhold')).toBe(false);
  });
});

describe('suffixedName / sameSubject — a threat or a plan\'s subject under a longer telling of its name', () => {
  const BASE = 'Unknown entity breaching blockade from far side';

  it('a name with more said after a separator is the same name', () => {
    expect(suffixedName(BASE, `${BASE}: imminent detection: high`)).toBe(true);
    expect(suffixedName('Raiders (two ships)', 'raiders')).toBe(true);
    expect(suffixedName('Raiders', 'The Raiders — the Red Fleet')).toBe(true);
    expect(suffixedName('Raiders', 'Raiders')).toBe(false);
    expect(suffixedName('Raiders', 'Raiders of the Rim')).toBe(false);
  });

  it('sameSubject: the same words; a suffix; a whole-word start or end; a near spelling', () => {
    expect(sameSubject('The Escort', 'the escort')).toBe(true);
    expect(sameSubject(BASE, `${BASE}: attention on Savela`)).toBe(true);
    expect(sameSubject('Archer', 'Vuldar Archer')).toBe(true);
    expect(sameSubject('corridor', 'the blockade corridor')).toBe(true);
    expect(sameSubject('Free the Kessan miners', 'free Kessan miners')).toBe(true);
    expect(sameSubject('the blockade of Onyx Threshold', 'blockade of Onyx Threshold tightening')).toBe(true);
    expect(sameSubject('Valdur Archer', 'Vuldar Archer')).toBe(true);
  });

  it('different subjects stay different — a shared leading word, or no word in common', () => {
    expect(sameSubject('Hull', 'Hull breach')).toBe(false);
    expect(sameSubject('the second presence', 'the escort')).toBe(false);
    expect(sameSubject('Mara Archer', 'Vuldar Archer')).toBe(false);
    expect(sameSubject('the escort', 'the blockade')).toBe(false);
    expect(sameSubject('', 'the escort')).toBe(false);
  });

  it('nameKey: lower case, single spaces, no leading article', () => {
    expect(nameKey('  The   Iron Choir ')).toBe('iron choir');
    expect(nameWords("Archer's rendezvous — the gap")).toEqual(["archer's", 'rendezvous', 'the', 'gap']);
  });
});

describe('generatedName / loreTitle — names the module files, written one way (P2-17, P2-18)', () => {
  it('a working label is title-cased and loses its leading article', () => {
    expect(generatedName('the corridor', { stripArticle: true })).toBe('Corridor');
    expect(generatedName("Archer's rendezvous — the gap", { stripArticle: true })).toBe("Archer's Rendezvous — The Gap");
    expect(generatedName('vault of   tears', { stripArticle: true })).toBe('Vault of Tears');
  });

  it('a figure keeps its article (it marks one still to be named), and a name with capitals stands', () => {
    expect(generatedName('the escort')).toBe('The Escort');
    expect(generatedName('ISV Savela')).toBe('ISV Savela');
    expect(generatedName('Vuldar Archer')).toBe('Vuldar Archer');
    expect(generatedName(null)).toBe('');
  });

  it('a lore title gets a capital first letter and no closing full stop — nothing else is changed', () => {
    expect(loreTitle('blockade corridor: an uncharted route.')).toBe('Blockade corridor: an uncharted route');
    expect(loreTitle('  Uncharted route discovered in  blockade corridor ')).toBe('Uncharted route discovered in blockade corridor');
    expect(loreTitle('"quoted" title')).toBe('"Quoted" title');
  });
});
