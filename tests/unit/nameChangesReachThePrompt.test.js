/**
 * STARFORGED COMPANION
 * tests/unit/nameChangesReachThePrompt.test.js
 *
 * Issue #377 item 1 — CORRECTION-AND-RENAME-DO-NOT-REACH-THE-RECORD.
 *
 * In the long haul's first live run the player struck "raider cutter — is
 * named the Ashen Wake" and set "raider cutter — is named the Cinder Wren",
 * and the GM renamed the NPC card "Tamsin Vey" to "Tamsin Okoro". The old
 * names stayed in the scene's truths, a clock, the hidden plan's subject,
 * lore, earlier sessions' summaries and the Chronicle; nothing told the
 * narrator one name had replaced the other, and it made both true ("Tamsin
 * Okoro. Though the docks swear she's Vey"). The change is now recorded once
 * (`campaignState.nameChanges`) and told wherever the old name still reaches
 * a prompt — the narrator's context in every mode, the recap's, the session
 * summary's source.
 *
 * The words below are the run's own (explorations/long-haul-live-20261123).
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/moves/interpreter.js', () => ({ interpretMove: vi.fn() }));
vi.mock('../../src/pacing/router.js', () => ({ routePacedInput: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import {
  nameSwapOf, withNameChange, mentionsOldName, dueNameChanges, formatNameChangesBlock,
  formatNameChangesForSource, nameCorrectionOf, NAME_CHANGES_HEADING, NAME_CHANGES_CAP,
} from '../../src/factContinuity/nameChanges.js';
import { buildNarratorSystemBlocks } from '../../src/narration/narratorPrompt.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { syncEntityRecordNameOnUpdate } from '../../src/index.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const VEY_TO_OKORO   = { from: 'Tamsin Vey', to: 'Tamsin Okoro', kind: 'renamed', about: 'a person', sessionId: 'sess-2' };
const ASHEN_TO_CINDER = { from: 'Ashen Wake', to: 'Cinder Wren', kind: 'corrected', about: 'raider cutter', sessionId: 'sess-2' };

describe('the name one fact gives and another corrects (nameSwapOf)', () => {
  it('reads the long haul\'s correction as a name change', () => {
    expect(nameSwapOf('is named the Ashen Wake', 'is named the Cinder Wren'))
      .toEqual({ from: 'Ashen Wake', to: 'Cinder Wren' });
    expect(nameSwapOf('is called the Ashen Wake', 'goes by Cinder Wren'))
      .toEqual({ from: 'Ashen Wake', to: 'Cinder Wren' });
  });

  it('a correction of where or who with a name in it is no rename', () => {
    expect(nameSwapOf('is docked at Bleakhold Station', 'is docked at Vigil Reach')).toBeNull();
    expect(nameSwapOf('owes Tamsin a debt', 'owes Juro a debt')).toBeNull();
  });

  it('a name and a longer form of it are one name', () => {
    expect(nameSwapOf('is called Tamsin', 'is called Tamsin Vey')).toBeNull();
  });

  it('no name on one side, or the same name, is no change', () => {
    expect(nameSwapOf('is named the Ashen Wake', 'is named the cutter')).toBeNull();
    expect(nameSwapOf('is named the Ashen Wake', 'is named the ashen wake')).toBeNull();
  });
});

describe('the stored list (withNameChange)', () => {
  it('a name changed again carries its earlier names', () => {
    const list = withNameChange(withNameChange([], { from: 'A Name', to: 'B Name' }), { from: 'B Name', to: 'C Name' });
    expect(list.map(c => `${c.from}>${c.to}`)).toEqual(['A Name>C Name', 'B Name>C Name']);
  });

  it('a change that undoes one drops it', () => {
    const list = withNameChange(withNameChange([], { from: 'Tamsin Vey', to: 'Tamsin Okoro' }), { from: 'Tamsin Okoro', to: 'Tamsin Vey' });
    expect(list.map(c => `${c.from}>${c.to}`)).toEqual(['Tamsin Okoro>Tamsin Vey']);
  });

  it('keeps the newest, up to its cap; ignores a change that is none', () => {
    let list = [];
    for (let i = 0; i < NAME_CHANGES_CAP + 5; i += 1) list = withNameChange(list, { from: `Old ${i}`, to: `New ${i}` });
    expect(list).toHaveLength(NAME_CHANGES_CAP);
    expect(list.at(-1).from).toBe(`Old ${NAME_CHANGES_CAP + 4}`);
    expect(withNameChange([], { from: 'Vey', to: ' vey ' })).toEqual([]);
  });
});

describe('when a change is told (dueNameChanges)', () => {
  it('when the old name — or the part the new one does not share — is in the text', () => {
    expect(mentionsOldName('promised Tamsin Vey she would return', VEY_TO_OKORO)).toBe(true);
    expect(mentionsOldName('"The docks call me Vey."', VEY_TO_OKORO)).toBe(true);
    expect(mentionsOldName('a survey of the docks', VEY_TO_OKORO)).toBe(false);
    expect(mentionsOldName('Tension: Ashen Wake — 0/4', ASHEN_TO_CINDER)).toBe(true);
    expect(mentionsOldName('the cutter left an ashen wake', ASHEN_TO_CINDER)).toBe(false);
  });

  it('while it is this session\'s, whatever the text', () => {
    expect(dueNameChanges([VEY_TO_OKORO], { texts: ['nothing here'], sessionId: 'sess-2' })).toHaveLength(1);
    expect(dueNameChanges([VEY_TO_OKORO], { texts: ['nothing here'], sessionId: 'sess-3' })).toHaveLength(0);
    expect(dueNameChanges([VEY_TO_OKORO], { texts: ['NPC agenda — Tamsin Vey'], sessionId: 'sess-3' })).toHaveLength(1);
  });

  it('the note says one name, and that the old one is no alias', () => {
    const note = formatNameChangesBlock([VEY_TO_OKORO], { sessionId: 'sess-2' });
    expect(note.startsWith(NAME_CHANGES_HEADING)).toBe(true);
    expect(note).toContain('"Tamsin Vey" is now "Tamsin Okoro" (a person) — renamed by the table.');
    expect(note).toMatch(/not an alias/);
    // The second live run made the change itself a story — a name "crossed out
    // and written again" — and the recap recorded "now goes by".
    expect(note).toMatch(/The change is the table's correction, not something that happened in the story/);
    expect(note).toMatch(/nobody renamed anyone, crossed a name out\s+or wrote it again/);
    expect(formatNameChangesForSource([ASHEN_TO_CINDER], { texts: ['The Ashen Wake holds station'] }))
      .toMatch(/never write that someone was renamed or "now goes by" a name/);
    expect(formatNameChangesForSource([ASHEN_TO_CINDER], { texts: ['The Ashen Wake holds station'] }))
      .toContain('"Ashen Wake" is now "Cinder Wren" (raider cutter) — corrected by the table.');
  });
});

// Known-issues CORRECTED-NAME-SHORT-FORM — the long haul's third live run
// (explorations/long-haul-live-20261124-0321). One step after "Ashen Wake" was
// corrected to "Cinder Wren" (a45), with the note in its prompt, the narrator
// wrote "The Wake's boarding lock cycles open" (a46): the note gave the old
// name whole, and the lore and the recent scene in the same prompt said "the
// Wake". The player's own a61 line said "the Wake's registry", and session 3's
// summary was written from it with no note at all.
describe('an old name cut short is told too (CORRECTED-NAME-SHORT-FORM)', () => {
  // The run's own lines: a lore line of session 2 (in the a46 system prompt),
  // the a46 narration, the player's a61 line.
  const LORE_A46   = 'Session 2: The Kobayashi IV swung round to engage the Wake at close range, knocking out two of the Wake\'s gun mounts and silencing her return fire.';
  const NARRATED   = 'The question gets its answer from the dark side of the hull. The Wake\'s boarding lock cycles open to a corridor with no lamp lit in it.';
  const PLAYER_A61 = 'PLAYER — Mira Kestrel wrote: "I lay the Bleakhold manifest stamp from the crate lid beside the Wake\'s registry and the voice\'s own words: the raids on the Cinder Expanse lanes trace back to one hand, and I can prove it."';
  const SHORT = 'The old name cut short is the old name too:';

  it('"the Wake" is the Ashen Wake: the line says so, and what to write', () => {
    const note = formatNameChangesBlock([ASHEN_TO_CINDER], { texts: [LORE_A46], sessionId: 'sess-2' });
    expect(note).toContain(`"Ashen Wake" is now "Cinder Wren" (raider cutter) — corrected by the table. ${SHORT} for "the Wake" write "the Wren".`);
  });

  it('a card renamed with its article: "The Ashen Wake" is "the Wake" too', () => {
    const renamed = { from: 'The Ashen Wake', to: 'The Cinder Wren', kind: 'renamed', about: 'a ship', sessionId: 'sess-2' };
    const note = formatNameChangesBlock([renamed], { texts: [LORE_A46], sessionId: 'sess-3' });
    expect(note).toContain(`"The Ashen Wake" is now "The Cinder Wren" (a ship) — renamed by the table. ${SHORT} for "the Wake" write "the Wren".`);
  });

  it('a text that holds the short form alone still names the old name', () => {
    expect(mentionsOldName(NARRATED, ASHEN_TO_CINDER)).toBe(true);
    expect(mentionsOldName(PLAYER_A61, ASHEN_TO_CINDER)).toBe(true);
    expect(mentionsOldName('You bring the *Kobayashi IV* round on the *Wake* again.', ASHEN_TO_CINDER)).toBe(true);
    // A capital that only opens a sentence is no name.
    expect(mentionsOldName('Wake up. The cutter is drifting.', ASHEN_TO_CINDER)).toBe(false);
    expect(mentionsOldName('the cutter left an ashen wake', ASHEN_TO_CINDER)).toBe(false);
  });

  it('the session summary\'s source: session 3 was written from "the Wake\'s registry" with no note', () => {
    const note = formatNameChangesForSource([ASHEN_TO_CINDER], { texts: [PLAYER_A61], sessionId: 'sess-3' });
    expect(note).toContain('"Ashen Wake" is now "Cinder Wren" (raider cutter) — corrected by the table.');
    expect(note).toContain(`${SHORT} for "the Wake" write "the Wren".`);
    expect(dueNameChanges([ASHEN_TO_CINDER], { texts: [PLAYER_A61], sessionId: 'sess-3' })).toHaveLength(1);
  });

  it('"Vey" is Tamsin Vey — and "Tamsin" is never an old name of Tamsin Okoro\'s', () => {
    const texts = ['"Tamsin Okoro. Though the docks swear she\'s Vey," the clerk says. Tamsin wipes her hands and tells Tamsin\'s runner to wait.'];
    const note = formatNameChangesBlock([VEY_TO_OKORO], { texts, sessionId: 'sess-2' });
    expect(note).toContain(`${SHORT} for "Vey" write "Okoro".`);
    expect(note).not.toMatch(/for "(?:the )?Tamsin"/);
  });

  it('not a word another name in play holds', () => {
    expect(formatNameChangesBlock([VEY_TO_OKORO], { texts: ['The docks still call her Vey.'], sessionId: 'sess-2' }))
      .toContain(`${SHORT} for "Vey" write "Okoro".`);
    // Her brother keeps the surname: "Vey" is not hers alone.
    const brother = formatNameChangesBlock([VEY_TO_OKORO], {
      texts: ['Juro Vey keeps the ledgers, and the docks still call her Vey.'], sessionId: 'sess-2',
    });
    expect(brother).toContain('"Tamsin Vey" is now "Tamsin Okoro" (a person) — renamed by the table.');
    expect(brother).not.toContain(SHORT);
    // Another cutter: "the Wake" may be either.
    const cutters = formatNameChangesBlock([ASHEN_TO_CINDER], {
      texts: ['The Silent Wake holds off Bleakhold while the Wake\'s guns go dark.'], sessionId: 'sess-2',
    });
    expect(cutters).not.toContain(SHORT);
    // Another name the table changed holds the word.
    const twoChanges = formatNameChangesBlock([VEY_TO_OKORO, { from: 'Juro Vey', to: 'Juro Hale', kind: 'renamed', sessionId: 'sess-2' }], {
      texts: ['The docks still call her Vey.'], sessionId: 'sess-2',
    });
    expect(twoChanges).not.toContain(SHORT);
  });

  it('only a form the call\'s text uses is listed', () => {
    const note = formatNameChangesBlock([ASHEN_TO_CINDER], { texts: ['Tension: Ashen Wake — 0/4'], sessionId: 'sess-2' });
    expect(note).toContain('"Ashen Wake" is now "Cinder Wren" (raider cutter) — corrected by the table.');
    expect(note).not.toContain(SHORT);
    // …and "the Ashen" is not listed because "the Wake" is.
    const both = formatNameChangesBlock([ASHEN_TO_CINDER], { texts: ['Tension: Ashen Wake — 0/4', LORE_A46], sessionId: 'sess-2' });
    expect(both).toContain(`${SHORT} for "the Wake" write "the Wren".`);
    expect(both).not.toMatch(/for "(?:the )?Ashen"/);
  });

  it('the new name whole, where its matching word is another name\'s too', () => {
    // "Cinder" is the Cinder Expanse's as well: "the Ashen" is not "the Cinder".
    const note = formatNameChangesBlock([ASHEN_TO_CINDER], {
      texts: ['The Ashen holds station off the Cinder Expanse lanes.'], sessionId: 'sess-2',
    });
    expect(note).toContain(`${SHORT} for "the Ashen" write "the Cinder Wren".`);
  });
});

describe('the narrator is told (buildNarratorSystemBlocks)', () => {
  const STATE = { currentSessionId: 'sess-3', sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } };

  it('an earlier session\'s correction, when the prompt holds only "the Wake"', () => {
    const blocks = buildNarratorSystemBlocks({ ...STATE, nameChanges: [ASHEN_TO_CINDER] }, {}, null, '', {
      mode: 'paced_narrative',
      rollingSummary: 'The Kobayashi IV swung round to engage the Wake at close range.',
    });
    expect(blocks.beat).toContain(NAME_CHANGES_HEADING);
    expect(blocks.beat).toContain('for "the Wake" write "the Wren".');
  });

  it('above the scene\'s truths, when the prompt still uses the old name', () => {
    const blocks = buildNarratorSystemBlocks({ ...STATE, nameChanges: [VEY_TO_OKORO] }, {}, null, '', {
      mode: 'paced_narrative',
      rollingSummary: 'Mira promised Tamsin Vey she would return before the next cargo tide.',
    });
    expect(blocks.beat).toContain(NAME_CHANGES_HEADING);
    expect(blocks.beat).toContain('"Tamsin Vey" is now "Tamsin Okoro"');
    // Per-beat, never in a cached block (narratorPromptBlocks invariant).
    expect(blocks.standing).not.toContain(NAME_CHANGES_HEADING);
    expect(blocks.mode).not.toContain(NAME_CHANGES_HEADING);
  });

  it('not when nothing it sends uses the old name and the change is an earlier session\'s', () => {
    const blocks = buildNarratorSystemBlocks({ ...STATE, nameChanges: [VEY_TO_OKORO] }, {}, null, '', {
      mode: 'paced_narrative', rollingSummary: 'Mira bought filters.',
    });
    expect(blocks.beat).not.toContain(NAME_CHANGES_HEADING);
  });

  it('the recap, when its Chronicle uses the old name', () => {
    const blocks = buildNarratorSystemBlocks({ ...STATE, nameChanges: [ASHEN_TO_CINDER] }, {}, null, '', {
      mode: 'campaign_recap',
      nameChangeTexts: ['Mira fought off the Ashen Wake off Bleakhold Station.'],
    });
    expect(blocks.beat).toContain('"Ashen Wake" is now "Cinder Wren"');
  });
});

describe('the table\'s corrections are recorded', () => {
  let installed;
  beforeEach(() => {
    installed = installJournalMock();
    global.ChatMessage._reset();
    game.user = { isGM: true, id: 'test-user-gm' };
  });
  afterEach(() => {
    installed.restore();
    game.settings._store.delete(KEY);
  });

  const truth = (id, text, fact, extra = {}) => ({
    id, subject: { kind: 'text', text }, fact,
    sessionId: 'sess-2', sessionNum: 2, sceneId: 'sc-1', moveId: null,
    source: 'narrator_sidecar', asserter: 'narrator', createdAt: 1,
    retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null, ...extra,
  });

  function seed(truths) {
    game.settings._store.set(KEY, {
      currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1',
      sceneTruths: truths, sceneState: { bySubject: {}, sceneId: 'sc-1' },
    });
  }

  it('`!truth strike` then `!truth set` of the long haul — the cutter\'s name', async () => {
    seed([truth('tr-ca277abc', 'raider cutter', 'is named the Ashen Wake')]);
    await applyFactContinuityCommand({ text: '!truth strike tr-ca277abc' }, { requesterIsGM: false });
    await applyFactContinuityCommand({ text: '!truth set "raider cutter" is named the Cinder Wren' }, { requesterIsGM: false });

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.nameChanges).toEqual([expect.objectContaining({
      from: 'Ashen Wake', to: 'Cinder Wren', kind: 'corrected', about: 'raider cutter', sessionId: 'sess-2',
    })]);
  });

  it('set first, then the old one struck — the same change', async () => {
    seed([truth('tr-ca277abc', 'raider cutter', 'is named the Ashen Wake')]);
    await applyFactContinuityCommand({ text: '!truth set "raider cutter" is named the Cinder Wren' }, { requesterIsGM: true });
    await applyFactContinuityCommand({ text: '!truth strike tr-ca277abc' }, { requesterIsGM: true });

    expect(game.settings.get(MODULE_ID, 'campaignState').nameChanges)
      .toEqual([expect.objectContaining({ from: 'Ashen Wake', to: 'Cinder Wren' })]);
  });

  it('control: a correction that is no name change records none', async () => {
    seed([truth('tr-dock0001', 'the dockmaster', 'is docked at Bleakhold Station')]);
    await applyFactContinuityCommand({ text: '!truth strike tr-dock0001' }, { requesterIsGM: true });
    await applyFactContinuityCommand({ text: '!truth set "the dockmaster" is docked at Vigil Reach' }, { requesterIsGM: true });

    expect(game.settings.get(MODULE_ID, 'campaignState').nameChanges ?? []).toEqual([]);
  });

  it('control: the X-Card\'s removal is no correction of the table\'s', () => {
    const state = {
      currentSessionId: 'sess-2',
      sceneTruths: [truth('tr-x', 'raider cutter', 'is named the Ashen Wake', { retracted: true, retractedBy: 'xcard' })],
    };
    expect(nameCorrectionOf(state, { subject: { kind: 'text', text: 'raider cutter' }, fact: 'is named the Cinder Wren' })).toBeNull();
  });
});

describe('a GM\'s rename of a card is recorded', () => {
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); };

  beforeEach(() => {
    game.actors._reset();
    game.user = { isGM: true, id: 'test-user-gm' };
    game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
    game.settings._store.set(KEY, { currentSessionId: 'sess-2' });
  });
  afterEach(() => game.settings._store.delete(KEY));

  function npcCard(id, name) {
    const actor = makeTestActor({
      id, name, type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, rank: 'dangerous', active: true, history: [] } } },
    });
    actor.getFlag = (mod, key) => actor.flags[mod]?.[key];
    actor.setFlag = async (mod, key, value) => { (actor.flags[mod] ??= {})[key] = value; };
    game.actors._set(id, actor);
    return actor;
  }

  it('the sidebar rename: "Tamsin Vey" is now "Tamsin Okoro"', async () => {
    const card = npcCard('npc-tamsin', 'Tamsin Vey');
    card.name = 'Tamsin Okoro';                       // Foundry applies the change before updateActor fires
    syncEntityRecordNameOnUpdate(card, { name: 'Tamsin Okoro' }, {}, 'test-user-gm');
    await flush();

    expect(game.settings.get(MODULE_ID, 'campaignState').nameChanges).toEqual([expect.objectContaining({
      from: 'Tamsin Vey', to: 'Tamsin Okoro', kind: 'renamed', about: 'a person', entityId: 'npc-tamsin', sessionId: 'sess-2',
    })]);
  });

  it('control: a rename whose record already holds the new name — a narration\'s reveal — records none', async () => {
    const card = npcCard('npc-voice', 'Tamsin');      // the record was written first (updateConnection)
    syncEntityRecordNameOnUpdate(card, { name: 'Tamsin' }, {}, 'test-user-gm');
    await flush();

    expect(game.settings.get(MODULE_ID, 'campaignState').nameChanges ?? []).toEqual([]);
  });
});
