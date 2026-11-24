/**
 * STARFORGED COMPANION
 * tests/unit/newNameWrittenOnce.test.js
 *
 * Known-issues NEW-NAME-WRITTEN-TWICE — found by the long haul's rehearsal
 * (2026-11-24, long-haul-rehearsal-20261124-171307). The third live run's road:
 * the NPC card was confirmed under a part of her name, "Tamsin", then renamed
 * "Tamsin Okoro". `writeNewNames` rewrote every whole-word "Tamsin" — the one
 * inside "Tamsin Okoro" too — so "tied the vow to Tamsin Okoro" read "… Tamsin
 * Okoro Okoro" on the Session Log pages, in THE RECORD of the recap's source
 * and in the recap itself (30 prompts). An old name — whole, its part, or cut
 * short — that already stands inside a name as it is now (its own new name,
 * another change's, another record's) is part of that name, and is left
 * alone; every form is matched in the text as stored, never in what another
 * change wrote there. The detection twins had the same fault: a text holding
 * only "Tamsin Okoro" counted as naming the old "Tamsin", so the change was
 * told to every prompt that wrote the new name (mentionsOldName); and a word
 * of an old name written inside another changed name ("Vey" in "Vey's
 * Lantern") counted as a short form used on its own (shortFormsInUse).
 */

import { describe, it, expect } from 'vitest';
import {
  writeNewNames, mentionsOldName, dueNameChanges, formatNameChangesBlock, withNameChange, NAME_CHANGES_HEADING,
} from '../../src/factContinuity/nameChanges.js';
import { readRecord } from '../../src/record/read.js';
import { recapText } from '../../src/record/recapView.js';
import { buildNarratorSystemBlocks } from '../../src/narration/narratorPrompt.js';

const TAMSIN = { from: 'Tamsin', to: 'Tamsin Okoro', kind: 'renamed', about: 'a person', sessionId: 'sess-2' };

describe('an old name inside its own new name is left alone (writeNewNames)', () => {
  it('the old name the first part of the new — the rehearsal\'s line', () => {
    expect(writeNewNames('Mira Kestrel — tied the vow to Tamsin Okoro', [TAMSIN])).toBe('Mira Kestrel — tied the vow to Tamsin Okoro');
    expect(writeNewNames('Tamsin closes her ledger stall; Tamsin Okoro waves.', [TAMSIN]))
      .toBe('Tamsin Okoro closes her ledger stall; Tamsin Okoro waves.');
  });

  it('the old name the last part of the new', () => {
    const okoro = { from: 'Okoro', to: 'Tamsin Okoro', kind: 'renamed' };
    expect(writeNewNames('Okoro said so. Tamsin Okoro smiled.', [okoro])).toBe('Tamsin Okoro said so. Tamsin Okoro smiled.');
  });

  it('the old name a middle part of the new', () => {
    const juro = { from: 'Juro', to: 'Ansel Juro Hale', kind: 'renamed' };
    expect(writeNewNames('Ansel Juro Hale nodded to Juro.', [juro])).toBe('Ansel Juro Hale nodded to Ansel Juro Hale.');
  });

  it('possessives: "Tamsin\'s" is the old name, "Tamsin Okoro\'s" the new', () => {
    expect(writeNewNames('Tamsin\'s runner waits by Tamsin Okoro\'s stall.', [TAMSIN]))
      .toBe('Tamsin Okoro\'s runner waits by Tamsin Okoro\'s stall.');
  });

  it('case: the new name in another case still stands, and an old name in lower case is no name', () => {
    expect(writeNewNames('Tamsin okoro signs; TAMSIN OKORO, the ledger says.', [TAMSIN])).toBe('Tamsin okoro signs; TAMSIN OKORO, the ledger says.');
    expect(writeNewNames('a sprig of tamsin in the stew', [TAMSIN])).toBe('a sprig of tamsin in the stew');
  });

  it('a chain of two renames, read folded: Tamsin → Tamsin Vey → Tamsin Okoro', () => {
    const chain = withNameChange(withNameChange([], { from: 'Tamsin', to: 'Tamsin Vey' }), { from: 'Tamsin Vey', to: 'Tamsin Okoro' });
    expect(chain.map(c => `${c.from} > ${c.to}`)).toEqual(['Tamsin > Tamsin Okoro', 'Tamsin Vey > Tamsin Okoro']);
    expect(writeNewNames('Tamsin Vey promised Tamsin a berth.', chain)).toBe('Tamsin Okoro promised Tamsin Okoro a berth.');
  });

  it('a chain whose first rename keeps the old name: Tamsin → Tamsin Okoro → Tamsin Hale', () => {
    const chain = withNameChange(withNameChange([], TAMSIN), { from: 'Tamsin Okoro', to: 'Tamsin Hale' });
    expect(writeNewNames('Tamsin waits; Tamsin Okoro nods; Tamsin Hale smiles.', chain))
      .toBe('Tamsin Hale waits; Tamsin Hale nods; Tamsin Hale smiles.');
  });

  it('a part of an old name that stands inside another name in play is that name\'s', () => {
    const vey = { from: 'Tamsin Vey', to: 'Tamsin Okoro', kind: 'renamed' };
    // Another record's name — her brother keeps the surname.
    expect(writeNewNames('Juro Vey keeps the ledgers for Tamsin Vey.', [vey], { otherNames: ['Juro Vey', 'Tamsin Okoro'] }))
      .toBe('Juro Vey keeps the ledgers for Tamsin Okoro.');
    // Another change's new name.
    const lantern = { from: 'Ashen Wake', to: 'Vey\'s Lantern', kind: 'corrected' };
    expect(writeNewNames('The cutter docks beside Vey\'s Lantern.', [vey, lantern])).toBe('The cutter docks beside Vey\'s Lantern.');
  });

  it('control: what it wrote before still stands — the whole name, the part, the short form', () => {
    const ashen = { from: 'Ashen Wake', to: 'Cinder Wren', kind: 'corrected' };
    expect(writeNewNames('The Ashen Wake docks; the Wake\'s guns are cold.', [ashen])).toBe('The Cinder Wren docks; the Cinder Wren\'s guns are cold.');
    expect(writeNewNames('"The docks call me Vey."', [{ from: 'Tamsin Vey', to: 'Tamsin Okoro' }])).toBe('"The docks call me Okoro."');
  });
});

describe('the record\'s views write the new name once', () => {
  let n = 0;
  const ev = (k, { s = 'sess-2', who = {}, ref = {}, d = {}, text } = {}) => {
    n += 1;
    return { id: `e${String(n).padStart(3, '0')}`, k, at: n * 1000, seq: n, s, scene: 'sc-1',
      who: { user: who.user ?? null, actor: who.actor ?? null }, ref, d, ...(text !== undefined ? { text } : {}) };
  };
  const page = (sessionId, events, number) => ({
    pageId: `p-${sessionId}`, sessionId, number, name: `Session ${number}`, createdAt: number, story: '',
    record: { v: 1, sessionId, seq: events.length, events: Object.fromEntries(events.map(e => [e.id, e])) },
  });

  it('the Session Log page\'s read: the line names her by her new name, and only once', () => {
    const events = [
      ev('line', { who: { actor: 'pc-mira' }, ref: { line: 'm1' }, d: { via: 'typed' }, text: 'I tie the vow to Tamsin Okoro.' }),
      ev('narration', { who: { actor: 'pc-mira' }, ref: { nar: 'n1' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'Tamsin nods, and the vow is tied.' }),
      ev('name.changed', { d: { from: 'Tamsin', to: 'Tamsin Okoro', how: 'renamed', about: 'a person' } }),
    ];
    const result = readRecord({ session: 'sess-2' }, {
      pages: [page('sess-2', events, 2)], currentSessionId: 'sess-2',
      nameOf: (id) => (id === 'pc-mira' ? 'Mira Kestrel' : null), otherNames: ['Mira Kestrel', 'Tamsin Okoro'],
    });
    const [beat] = result.sessions[0].beats;
    expect(beat.line.text).toBe('I tie the vow to Tamsin Okoro.');
    expect(beat.told.text).toBe('Tamsin Okoro nods, and the vow is tied.');
    expect(JSON.stringify(result.sessions)).not.toMatch(/Okoro Okoro/);
  });

  it('the recap\'s text', () => {
    const paragraphs = [[{ text: 'Mira tied the vow to Tamsin Okoro.' }, { text: 'Tamsin promised her a berth.' }]];
    expect(recapText(paragraphs, { names: [TAMSIN], otherNames: ['Tamsin Okoro'] }))
      .toBe('Mira tied the vow to Tamsin Okoro. Tamsin Okoro promised her a berth.');
  });
});

describe('a text that writes only the new name names no old one (mentionsOldName, dueNameChanges)', () => {
  it('"Tamsin" inside "Tamsin Okoro" is not the old name; on its own it is', () => {
    expect(mentionsOldName('Tamsin Okoro keeps the ledger.', TAMSIN)).toBe(false);
    expect(mentionsOldName('Tamsin Okoro\'s runner waits.', TAMSIN)).toBe(false);
    expect(mentionsOldName('Tamsin keeps the ledger.', TAMSIN)).toBe(true);
    expect(mentionsOldName('Tamsin\'s runner waits.', TAMSIN)).toBe(true);
    expect(dueNameChanges([TAMSIN], { texts: ['NPC agenda — Tamsin Okoro'], sessionId: 'sess-3' })).toEqual([]);
    expect(dueNameChanges([TAMSIN], { texts: ['Tamsin Okoro waits.', 'Tamsin waves.'], sessionId: 'sess-3' })).toHaveLength(1);
  });

  it('a part of an old name inside another change\'s new name is that name\'s — whole, or cut short (shortFormsInUse)', () => {
    const vey = { from: 'Tamsin Vey', to: 'Tamsin Okoro', kind: 'renamed', sessionId: 'sess-2' };
    const lantern = { from: 'Ashen Wake', to: 'Vey\'s Lantern', kind: 'corrected', sessionId: 'sess-2' };
    expect(dueNameChanges([vey, lantern], { texts: ['The cutter docks beside Vey\'s Lantern.'], sessionId: 'sess-3' })).toEqual([]);
    // Said on its own too, "Vey" is hers — but not hers alone: no "write Okoro" for it.
    const note = formatNameChangesBlock([vey, lantern], { texts: ['The cutter docks beside Vey\'s Lantern; the docks still call her Vey.'], sessionId: 'sess-3' });
    expect(note).toContain('"Tamsin Vey" is now "Tamsin Okoro" — renamed by the table.');
    expect(note).not.toContain('The old name cut short');
  });

  it('the narrator\'s prompt: an earlier session\'s change is not told where only the new name is written', () => {
    const state = { currentSessionId: 'sess-3', sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, nameChanges: [TAMSIN] };
    const onlyNew = buildNarratorSystemBlocks(state, {}, null, '', { mode: 'paced_narrative', rollingSummary: 'Mira tied her vow to Tamsin Okoro.' });
    expect(onlyNew.beat).not.toContain(NAME_CHANGES_HEADING);
    const old = buildNarratorSystemBlocks(state, {}, null, '', { mode: 'paced_narrative', rollingSummary: 'Mira tied her vow to Tamsin.' });
    expect(old.beat).toContain('"Tamsin" is now "Tamsin Okoro" (a person) — renamed by the table.');
  });
});
