/**
 * CHARACTER-STATE-ENTITY-UNDECODED: one HTML-entity decoder for the text the
 * module reads out of HTML. actorBridge's CHARACTER STATE decoded no entities
 * ("&amp;" and "&middot;" reached the narrator as written); narratorPrompt's
 * stripHtml decoded `&amp;` first, so an escaped "&amp;lt;" became "<"; the
 * Notes card text and the truths dialog each kept a table of their own.
 */
import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities } from '../../src/system/htmlEntities.js';
import { stripHtml, notesAsCardText } from '../../src/narration/narratorPrompt.js';
import { readCharacterSnapshot } from '../../src/character/actorBridge.js';

describe('decodeHtmlEntities — one pass, named and numeric', () => {
  it('decodes the named and numeric entities', () => {
    expect(decodeHtmlEntities('she/her &middot; Wary &mdash; &#x2014; &#183; &ldquo;Doc&rdquo;'))
      .toBe('she/her · Wary — — · “Doc”');
  });
  it('leaves an escaped entity as text (one pass) and an unknown one as written', () => {
    expect(decodeHtmlEntities('&amp;middot; &amp;lt;b&amp;gt; &bogus; &#0;')).toBe('&middot; &lt;b&gt; &bogus; &#0;');
  });
});

describe('every reader uses it', () => {
  it("CHARACTER STATE: a PC's notes decode their entities", () => {
    const actor = { id: 'pc-1', name: 'Kira', type: 'character', items: { contents: [] },
      system: { notes: '<p>Owes Mara &amp; Doc &middot; a favour</p>', biography: '<p>Born on &ldquo;Bleakhold&rdquo;</p>',
        momentum: { value: 2, max: 10, resetValue: 2 }, health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 } } };
    const snap = readCharacterSnapshot(actor);
    expect(snap.notes).toBe('Owes Mara & Doc · a favour');
    expect(snap.biography).toBe('Born on “Bleakhold”');
  });
  it("narratorPrompt.stripHtml decodes in one pass — an escaped tag stays text", () => {
    expect(stripHtml('<p>A &amp;lt;signal&amp;gt; &middot; lost</p>').trim()).toBe('A &lt;signal&gt; · lost');
  });
  it('the Notes card text still decodes its seeds\' fact line', () => {
    expect(notesAsCardText('<p>she/her &middot; Wary</p>')).toBe('she/her · Wary');
  });
});
