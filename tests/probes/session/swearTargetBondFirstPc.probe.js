/**
 * PROBE — the inciting vow target's bond Item lands on the FIRST player
 * character only (swearSharedVowForAll → registerConnectionOnActiveCharacter,
 * src/entities/entityExtractor.js: `const actor = actors?.[0]`), while the
 * shared vow it serves is created on EVERY PC with
 * `linkedConnectionName = <target>` (createCharacterVowItem shared:true).
 *
 * So PC 2 holds a vow "for" a connection that is not on their Connections tab
 * (the narrator's CHARACTER block for PC 2 lists no such bond, and the fulfil
 * payoff's deepen — setBondItemTicks by the record's _id — has no Item of
 * theirs to mirror onto). Whoever clicked ⚔ Swear this vow is irrelevant: the
 * bond follows game.actors order. Sector creation and the quickstart backfill,
 * by contrast, mirror a connection's bond Item onto every PC.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({ _id: 'conn-vance', name: data.name, rank: 'dangerous' })),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  entityExistsAnyType:            vi.fn(() => false),
  postCreationEnrichment:         vi.fn(async () => {}),
  promoteNewEntityLedgerSubjects: vi.fn(async () => {}),
}));
vi.mock('../../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  narrateAndPostVowSwearing: vi.fn(async () => {}),
}));

import { swearSharedVowForAll } from '../../../src/session/swearVow.js';

const MODULE_ID = 'starforged-companion';

function pc(id, name) {
  const a = makeTestActor({ id, name, type: 'character' });
  game.actors._set(id, a);
  return a;
}

const bondsOf = (actor) => actor.items.contents.filter(i => i.type === 'progress' && i.system?.subtype === 'bond');
const vowsOf  = (actor) => actor.items.contents.filter(i => i.type === 'progress' && i.system?.subtype === 'vow');

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'ssn-1', connectionIds: [] });
  game.user.isGM = true;
});

describe('PROBE SWEAR-TARGET-BOND-FIRST-PC', () => {
  it('every PC the shared vow is sworn on also gets the vow target as a connection', async () => {
    silenceConsoleErrors();
    const kira = pc('pc-kira', 'Kira');   // first in game.actors
    const tomas = pc('pc-tomas', 'Tomas'); // e.g. the one who clicked ⚔ Swear this vow

    const card = makeTestMessage({
      id: 'inc-1',
      content: '<div class="sf-incite-card"><div class="sf-incite-actions"><button>⚔</button></div></div>',
      flags: { [MODULE_ID]: {
        incitingIncidentCard: true,
        incitingMeta: {
          vow:    { statement: 'Bring Vance home', rank: 'dangerous' },
          clock:  null,
          immediateCrisis: null,
          target: { name: 'Vance', pronouns: 'he/him', description: 'An old mentor, adrift.' },
        },
      } },
    }, { author: 'test-user-gm' });

    const res = await swearSharedVowForAll(card);
    expect(res?.actors?.map(a => a.id)).toEqual(['pc-kira', 'pc-tomas']);

    // the shared vow is on both, linked to the target
    for (const a of [kira, tomas]) {
      expect(vowsOf(a).map(v => v.flags[MODULE_ID].linkedConnectionName)).toEqual(['Vance']);
    }
    // …and so should the bond be
    expect(bondsOf(kira).map(b => b.flags[MODULE_ID].connectionId)).toEqual(['conn-vance']);
    expect(bondsOf(tomas).map(b => b.flags[MODULE_ID].connectionId)).toEqual(['conn-vance']); // actual today: []
  });
});
