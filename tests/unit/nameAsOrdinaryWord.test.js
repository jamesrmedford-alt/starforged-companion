/**
 * STARFORGED COMPANION
 * tests/unit/nameAsOrdinaryWord.test.js
 *
 * Issue #362 D6 NAME-AS-ORDINARY-WORD — decided A (maintainer, 2026-11-17): a
 * one-word name counts only when capitalised as typed, or in address
 * position (the line's first word, or a vocative) — in the fellow-PC rule and
 * in the relevance resolver.
 *
 * The module's own name oracles give ordinary words — Will, Ash, Echo, Hope,
 * Sage — and both rules matched a name's word in any case:
 *   - the fellow-PC rule (issue #354 P2-06) turned another player's Compel
 *     that held the word into narration with no move offered: "I will press
 *     the dockmaster" with a PC called Will at the table, "…or I leave this
 *     station in ash" with a PC called Ash (coverage IDXA, MOVA D2);
 *   - Phase-1 relevance matched it: "I check the scanner for an echo" brought
 *     in Echo Vega's card and made a hybrid move an interaction with her
 *     (coverage WJ D3).
 * resolveEntityName (the writes' resolver) already required a capital for a
 * name part; both rules now read a typed line the same way
 * (relevanceResolver.namesOneWordName). A name of more than one word still
 * matches in any case.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as relevance from '../../src/context/relevanceResolver.js';
import {
  lineIsToAFellowPlayerCharacter, suppressPcDirectedSocialMove,
} from '../../src/narration/narrator.js';

const MODULE = 'starforged-companion';
const ent = (name, journalId) => ({ _id: `rec-${journalId}`, journalId, name, entityType: 'connection' });
const { buildNameIndex, matchNamesInNarration, resolveRelevance } = relevance;
/** The shared rule (reached through the namespace: its absence is an assertion, not an import error). */
function namesOneWordName(text, word) {
  expect(typeof relevance.namesOneWordName, 'relevanceResolver exports the one-word-name rule').toBe('function');
  return relevance.namesOneWordName(text, word);
}

describe('issue #362 D6 — namesOneWordName: a one-word name as a name is written', () => {
  it('capitalised as typed: a name', () => {
    expect(namesOneWordName('I hail Echo on the open band.', 'echo')).toBe(true);
    expect(namesOneWordName('Ask Zoë about the cargo.', 'zoë')).toBe(true);
  });

  it('lowercase in running text: the ordinary word', () => {
    expect(namesOneWordName('I check the scanner for an echo.', 'echo')).toBe(false);
    expect(namesOneWordName('I will press the dockmaster for the manifest.', 'will')).toBe(false);
    expect(namesOneWordName('Hand it over or I leave this station in ash.', 'ash')).toBe(false);
    expect(namesOneWordName('I will, if you insist.', 'will')).toBe(false);
    expect(namesOneWordName('Fine, will do.', 'will')).toBe(false);
  });

  it('address position, in any case: the first word of the line, or a vocative', () => {
    expect(namesOneWordName('will, hand me the codes', 'will')).toBe(true);
    expect(namesOneWordName('"echo — are you there?"', 'echo')).toBe(true);
    expect(namesOneWordName('hand me the codes, will.', 'will')).toBe(true);
    expect(namesOneWordName('listen, ash, we go now', 'ash')).toBe(true);
    expect(namesOneWordName('I wait by the hatch.\nash, open it', 'ash')).toBe(true);
  });

  it('a whole word only — never inside a longer one', () => {
    expect(namesOneWordName('We dock at Ashford.', 'ash')).toBe(false);
    expect(namesOneWordName('', 'ash')).toBe(false);
  });
});

describe('issue #362 D6 — the relevance resolver: a one-word name hit only as a name is written', () => {
  const roster = [ent('Echo Vega', 'npc-echo'), ent('Sable', 'npc-sable')];
  const index = buildNameIndex(roster, []);
  const matched = (line) => matchNamesInNarration(line, index).matchedNames;

  it('"an echo on the scanner" names nobody; "Echo" and "Sable" capitalised name them', () => {
    expect(matched('I check the scanner for an echo.')).toEqual([]);
    expect(matched('The sable cloak hides the blade.')).toEqual([]);
    expect(matched('I hail Echo on the open band.')).toEqual(['Echo Vega']);
    expect(matched('I ask Sable for the codes.')).toEqual(['Sable']);
  });

  it('control: a full name of two words names her in any case; a vocative in lowercase does too', () => {
    expect(matched('echo vega, answer the hail')).toEqual(['Echo Vega']);
    expect(matched('answer the hail, echo.')).toEqual(['Echo Vega']);
  });

  it('a hybrid move whose line has the ordinary word is not an interaction with her', async () => {
    const classifyImplicit = async () => ({ impliedEntity: false, referenceType: 'none' });
    const collectEntities = async () => roster;
    const ordinary = await resolveRelevance('I check the scanner for an echo.', 'face_danger', 'strong_hit', { dismissedEntities: [] },
      { collectEntities, classifyImplicit });
    expect(ordinary).toMatchObject({ resolvedClass: 'discovery', entityIds: [] });
    const named = await resolveRelevance('I hail Echo and dodge the debris.', 'face_danger', 'strong_hit', { dismissedEntities: [] },
      { collectEntities, classifyImplicit });
    expect(named).toMatchObject({ resolvedClass: 'interaction', entityIds: ['npc-echo'] });
  });
});

describe('issue #362 D6 — the fellow-PC rule: a PC\'s or an NPC\'s one-word name only as a name is written', () => {
  const pcs = [{ name: 'Isaac Sutton' }, { name: 'Will Harrow' }, { name: 'Ash' }, { name: 'Karthik Shepherd' }];
  const toFellow = (line, npcNames = ['Vuldar Archer']) =>
    lineIsToAFellowPlayerCharacter('compel', line, 'Isaac Sutton', { pcActors: pcs, npcNames });

  it('a Compel with the ordinary word "will" or "ash" in it is rolled, not narrated as a line to Will or Ash', () => {
    expect(toFellow('I will press the dockmaster for the manifest.')).toBe(false);
    expect(toFellow('Hand over the codes, or I leave this station in ash.')).toBe(false);
  });

  it('control: a line to Will or Ash by name — capitalised, or addressed in lowercase — is still theirs', () => {
    expect(toFellow('Will, cover the door while I press him.')).toBe(true);
    expect(toFellow('will, cover the door while I press him.')).toBe(true);
    expect(toFellow('Cover the door, Ash.')).toBe(true);
    expect(toFellow('will harrow, do you trust me?')).toBe(true);
  });

  it('an NPC\'s word in lowercase is no NPC named: a line to Karthik with "an echo" in it is his', () => {
    expect(toFellow('Karthik, there is an echo on the scanner — answer me!', ['Echo Vega'])).toBe(true);
    // Control: capitalised, the NPC is named, and the Compel is hers.
    expect(toFellow('Karthik, ask Echo what she saw — now!', ['Echo Vega'])).toBe(false);
  });

  it('the offer\'s filter reads the line the same way: the Compel is offered beside "I will press the dockmaster"', () => {
    expect(suppressPcDirectedSocialMove('compel', 'I will press the dockmaster for the manifest.', 'Isaac Sutton', pcs)).toBe('compel');
    expect(suppressPcDirectedSocialMove('compel', 'Will, press the dockmaster for me.', 'Isaac Sutton', pcs)).toBeNull();
  });
});

describe('issue #362 D6 — the fellow-PC rule over the real roster (PCs from the actors, NPCs from campaignState)', () => {
  beforeEach(() => {
    global.game.actors._reset();
    for (const [id, name] of [['pc-isaac', 'Isaac Sutton'], ['pc-will', 'Will Harrow']]) {
      global.game.actors._set(id, global.makeTestActor({ id, type: 'character', name }));
    }
    global.game.actors._set('npc-echo', global.makeTestActor({
      id: 'npc-echo', type: 'character', name: 'Echo Vega',
      flags: { [MODULE]: { entityType: 'connection', connection: { _id: 'rec-echo', name: 'Echo Vega', active: true } } },
    }));
  });

  it('"I will press the dockmaster" is no line to Will Harrow; "Will, …" is', () => {
    const cs = { connectionIds: ['npc-echo'] };
    expect(lineIsToAFellowPlayerCharacter('compel', 'I will press the dockmaster.', 'Isaac Sutton', { campaignState: cs })).toBe(false);
    expect(lineIsToAFellowPlayerCharacter('compel', 'Will, there is an echo on the scanner — check it!', 'Isaac Sutton', { campaignState: cs })).toBe(true);
    expect(lineIsToAFellowPlayerCharacter('compel', 'Will, make Echo talk.', 'Isaac Sutton', { campaignState: cs })).toBe(false);
  });
});
