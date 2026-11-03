// tests/unit/vowTargetKind.test.js
// A vow target that is a faction, creature or vessel is not made a
// connection (issue #326 W70). The inciting prompt asks for a vow target
// "when the vow concerns a specific person, creature, faction, or vessel",
// and swearSharedVowForAll made every target a connection — a bond Item on
// every PC, `linkedConnectionName` on every vow copy — so fulfilling the vow
// offered "Deepen your bond with The Iron Covenant". The target line now
// carries its kind (read from the description when it has none), and only
// a person becomes a connection.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({ _id: 'rec-new', name: data.name, rank: 'dangerous' })),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  postCreationEnrichment:         vi.fn(async () => {}),
  promoteNewEntityLedgerSubjects: vi.fn(async () => {}),
}));
vi.mock('../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  narrateAndPostVowSwearing: vi.fn(async () => {}),
}));

import { createConnection } from '../../src/entities/connection.js';
import { splitIncitingMeta, splitVowTarget, vowTargetKind } from '../../src/session/incitingIncident.js';
import { swearSharedVowForAll } from '../../src/session/swearVow.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

// The proposal block as the prompt asks for it, for a faction target.
const REPLY = [
  'The relay goes dark as the Iron Covenant seizes the Ashwind docks.',
  '',
  'Suggested vow: I will break the Iron Covenant\'s hold on Ashwind (formidable)',
  'Vow target: The Iron Covenant (they/them) — a zealot faction that seized the Ashwind relay and its people.',
  'Situation: The Iron Covenant holds the Ashwind relay.',
].join('\n');

function incitingCard(meta) {
  return makeTestMessage({
    id: 'inc-1',
    content: '<div class="sf-incite-card"><div class="sf-incite-actions"><button>⚔</button></div></div>',
    flags: { [MODULE_ID]: { incitingIncidentCard: true, incitingMeta: meta } },
  }, { author: 'test-user-gm' });
}

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', connectionIds: [] });
  game.user.isGM = true;
  vi.mocked(createConnection).mockClear();
});

describe('only a person the vow concerns is made a connection (issue #326 W70)', () => {
  it('control: the inciting prompt asks for a vow target that is a faction or a vessel', () => {
    const prompt = buildNarratorSystemPrompt(
      { safety: { lines: [], veils: [], privateLines: [] }, worldTruths: {} },
      { narrationTone: 'wry', narrationPerspective: 'second_person', narrationLength: 3 },
      null, '', { mode: 'inciting_incident' },
    );
    expect(prompt).toMatch(/person,\s*creature,\s*faction,\s*or vessel/);
  });

  it('swearing a vow against a faction does not make the faction a connection with a bond on every PC', async () => {
    silenceConsoleErrors();
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    const ren  = makeTestActor({ id: 'pc-ren',  name: 'Ren',  type: 'character' });
    game.actors._setAll([kira, ren]);
    const meta = splitIncitingMeta(REPLY);
    await swearSharedVowForAll(incitingCard({ vow: meta.vow, clock: meta.clock, immediateCrisis: meta.immediateCrisis, target: meta.target }),
      { speakerActorId: 'pc-kira' });

    // It made createConnection({ name: "The Iron Covenant", … }), a bond Item
    // "The Iron Covenant" on both PCs, and linked the vow to deepen it.
    expect(vi.mocked(createConnection)).not.toHaveBeenCalled();
    for (const pc of [kira, ren]) {
      expect(pc.items.contents.filter(i => i.system?.subtype === 'bond').map(i => i.name)).toEqual([]);
      const vow = pc.items.contents.find(i => i.system?.subtype === 'vow');
      expect(vow.flags[MODULE_ID].linkedConnectionName ?? null).toBeNull();
    }
  });
  it('the proposal line carries the kind, and the prompt asks for it', () => {
    const prompt = buildNarratorSystemPrompt(
      { safety: { lines: [], veils: [], privateLines: [] }, worldTruths: {} },
      { narrationTone: 'wry', narrationPerspective: 'second_person', narrationLength: 3 },
      null, '', { mode: 'inciting_incident' },
    );
    expect(prompt).toMatch(/\[<kind — exactly one of: person, creature, faction, vessel>\]/);
    expect(splitVowTarget('Vow target: The Wanderer (it/its) [vessel] — a derelict colony ship.').target)
      .toEqual({ name: 'The Wanderer', pronouns: 'it/its', description: 'a derelict colony ship.', kind: 'vessel' });
    expect(splitVowTarget('Vow target: Dani Okoro (she/her) [person] — your sister.').target.kind).toBe('person');
  });

  it('with no kind given, it is read from the description\'s head', () => {
    expect(vowTargetKind('a zealot faction that seized the Ashwind relay')).toBe('faction');
    expect(vowTargetKind('a smuggler who works for the Iron Syndicate')).toBe('person');
    expect(vowTargetKind('the leviathan that haunts the Rift')).toBe('creature');
    expect(vowTargetKind('')).toBe('person');
  });

  it('control: a person target is still made a connection, the vow linked to it', async () => {
    silenceConsoleErrors();
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    game.actors._setAll([kira]);
    const meta = splitIncitingMeta(REPLY.replace('Vow target: The Iron Covenant (they/them) — a zealot faction that seized the Ashwind relay and its people.',
      'Vow target: Dani Okoro (she/her) — your sister, taken by Covenant raiders.'));
    await swearSharedVowForAll(incitingCard({ vow: meta.vow, clock: meta.clock, immediateCrisis: meta.immediateCrisis, target: meta.target }),
      { speakerActorId: 'pc-kira' });
    expect(vi.mocked(createConnection)).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dani Okoro' }), expect.anything());
    const vow = kira.items.contents.find(i => i.system?.subtype === 'vow');
    expect(vow.flags[MODULE_ID].linkedConnectionName).toBe('Dani Okoro');
  });
});
