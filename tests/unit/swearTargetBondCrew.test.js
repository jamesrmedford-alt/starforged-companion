/**
 * The shared inciting vow's target is a connection of every PC who swore it,
 * and its oath scene is the roller's (issue #321 U23).
 *
 * swearSharedVowForAll creates the shared vow on EVERY player character with
 * `linkedConnectionName = <target>`, but registered the target's bond Item on
 * the first PC only (registerConnectionOnActiveCharacter took
 * `getPlayerActors()[0]`). PC 2 held a vow "for" a connection missing from
 * their Connections tab — and from their narrator CHARACTER block — and the
 * fulfil payoff's deepen had no Item of theirs to mirror onto. Sector
 * creation and the quickstart backfill already mirror a connection's bond
 * Item onto every PC.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({ _id: 'conn-vance', name: data.name, rank: 'dangerous' })),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  entityExistsAnyType:            vi.fn(() => false),
  postCreationEnrichment:         vi.fn(async () => {}),
  promoteNewEntityLedgerSubjects: vi.fn(async () => {}),
}));
vi.mock('../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  narrateAndPostVowSwearing: vi.fn(async () => {}),
}));

import { swearSharedVowForAll } from '../../src/session/swearVow.js';
import { narrateAndPostVowSwearing } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';

function pc(id, name) {
  const a = makeTestActor({ id, name, type: 'character' });
  game.actors._set(id, a);
  return a;
}

const bondsOf = (actor) => actor.items.contents.filter(i => i.type === 'progress' && i.system?.subtype === 'bond');
const vowsOf  = (actor) => actor.items.contents.filter(i => i.type === 'progress' && i.system?.subtype === 'vow');

function incitingCard() {
  return makeTestMessage({
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
}

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'ssn-1', connectionIds: [] });
  game.user.isGM = true;
  narrateAndPostVowSwearing.mockClear();
});

describe('swearing the shared inciting vow', () => {
  it('every PC the shared vow is sworn on also gets the vow target as a connection', async () => {
    silenceConsoleErrors();
    const kira  = pc('pc-kira', 'Kira');    // first in game.actors
    const tomas = pc('pc-tomas', 'Tomas');  // e.g. the one who clicked ⚔ Swear this vow

    const res = await swearSharedVowForAll(incitingCard());
    expect(res?.actors?.map(a => a.id)).toEqual(['pc-kira', 'pc-tomas']);

    for (const a of [kira, tomas]) {
      expect(vowsOf(a).map(v => v.flags[MODULE_ID].linkedConnectionName)).toEqual(['Vance']);
    }
    expect(bondsOf(kira).map(b => b.flags[MODULE_ID].connectionId)).toEqual(['conn-vance']);
    expect(bondsOf(tomas).map(b => b.flags[MODULE_ID].connectionId)).toEqual(['conn-vance']);
  });

  it('the oath scene is written for the PC who rolled the swear', async () => {
    silenceConsoleErrors();
    pc('pc-kira', 'Kira');
    pc('pc-tomas', 'Tomas');

    await swearSharedVowForAll(incitingCard(), { speakerActorId: 'pc-tomas' });

    expect(narrateAndPostVowSwearing).toHaveBeenCalledTimes(1);
    expect(narrateAndPostVowSwearing.mock.calls[0][0]).toMatchObject({ speakerActorId: 'pc-tomas' });
  });
});
